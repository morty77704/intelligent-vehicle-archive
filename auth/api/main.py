"""Auth Agent — 人脸 + 账密登录服务  端口 8004"""
import os, sys, json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.db_util import query_one, query_all, insert
from utils.image_util import decode_base64_image, decode_base64_bytes

app = FastAPI(title="Auth Agent - Login Service")

# ── 人脸存储目录 ────────────────────────────────────────
FACES_DIR = Path(__file__).resolve().parent.parent / "faces"
FACES_DIR.mkdir(exist_ok=True)


# ── 请求/响应模型 ────────────────────────────────────────
class RegisterRequest(BaseModel):
    image: str
    name: str
    age: str
    phone: str
    password: str


class PasswordLoginRequest(BaseModel):
    phone: str
    password: str


class FaceLoginRequest(BaseModel):
    image: str


class LoginResponse(BaseModel):
    status: int
    msg: str
    user_id: Optional[int] = None
    user_name: Optional[str] = None


# ── 生成唯一用户ID ──────────────────────────────────────
def generate_user_id():
    """生成不重复的用户ID（1-100范围内，避开已用的）"""
    rows = query_all("SELECT user_id FROM user_info")
    used = {r[0] for r in rows}
    for i in range(1, 101):
        if i not in used:
            return i
    raise HTTPException(500, detail="用户ID已满（100人上限）")


# ═══════════════════════════════════════════════════════
# 1. 人脸注册
# ═══════════════════════════════════════════════════════
@app.post("/api/auth/register")
def register(req: RegisterRequest):
    import face_recognition

    # 校验手机号
    phone = req.phone.strip()
    if not phone or len(phone) != 11 or not phone.isdigit():
        return {"status": 500, "msg": "手机号格式不正确"}

    # 检查手机号是否已注册
    existing = query_one("SELECT user_id FROM user_info WHERE user_phone=%s", (phone,))
    if existing:
        return {"status": 500, "msg": "该手机号已被注册"}

    # 解码图片
    try:
        img_array = decode_base64_image(req.image)
    except Exception as e:
        return {"status": 500, "msg": f"图像解码失败：{e}"}

    # 检测人脸
    try:
        locations = face_recognition.face_locations(img_array)
    except Exception as e:
        return {"status": 500, "msg": f"人脸检测异常：{e}"}

    if len(locations) == 0:
        return {"status": 500, "msg": "未检测到人脸，请调整位置"}

    # 提取人脸特征
    encodings = face_recognition.face_encodings(img_array, locations)
    if len(encodings) == 0:
        return {"status": 500, "msg": "无法提取人脸特征"}

    # 与已注册人脸比对，防止重复注册
    for face_file in FACES_DIR.glob("*.jpg"):
        try:
            known_img = face_recognition.load_image_file(str(face_file))
            known_loc = face_recognition.face_locations(known_img)
            if len(known_loc) == 0:
                continue
            known_enc = face_recognition.face_encodings(known_img, known_loc)
            if len(known_enc) == 0:
                continue
            matches = face_recognition.compare_faces(known_enc, encodings[0], tolerance=0.4)
            if any(matches):
                return {"status": 201, "msg": "该用户已采集过人脸信息"}
        except Exception:
            continue

    # 生成用户ID并保存图片
    user_id = generate_user_id()
    face_path = FACES_DIR / f"{user_id}.jpg"
    try:
        img_bytes = decode_base64_bytes(req.image)
        with open(face_path, "wb") as f:
            f.write(img_bytes)
    except Exception as e:
        return {"status": 500, "msg": f"保存人脸图片失败：{e}"}

    # 写入数据库
    ok = insert(
        "INSERT INTO user_info(user_id, user_name, user_age, user_phone, user_password) VALUES(%s,%s,%s,%s,%s)",
        (user_id, req.name.strip(), req.age.strip(), phone, req.password),
    )
    if not ok:
        # 回滚图片
        face_path.unlink(missing_ok=True)
        return {"status": 500, "msg": "写入数据库失败"}

    return {"status": 200, "msg": f"注册成功（用户ID: {user_id}）", "user_id": user_id}


# ═══════════════════════════════════════════════════════
# 2. 手机号+密码登录
# ═══════════════════════════════════════════════════════
@app.post("/api/auth/login/password")
def login_password(req: PasswordLoginRequest):
    phone = req.phone.strip()
    password = req.password.strip()

    if not phone or len(phone) != 11 or not phone.isdigit():
        return {"status": 500, "msg": "手机号格式不正确"}
    if not password:
        return {"status": 500, "msg": "请输入密码"}

    row = query_one(
        "SELECT user_id, user_name, user_password FROM user_info WHERE user_phone=%s",
        (phone,),
    )
    if not row:
        return {"status": 404, "msg": "该手机号未注册"}

    if password != row[2]:
        return {"status": 500, "msg": "密码错误"}

    return {"status": 200, "msg": "登录成功", "user_id": row[0], "user_name": row[1]}


# ═══════════════════════════════════════════════════════
# 3. 人脸登录（仅需图片，自动识别用户身份）
# ═══════════════════════════════════════════════════════
@app.post("/api/auth/login/face")
def login_face(req: FaceLoginRequest):
    import face_recognition

    # 解码图片
    try:
        img_array = decode_base64_image(req.image)
    except Exception as e:
        return {"status": 500, "msg": f"图像解码失败：{e}"}

    # 检测人脸
    try:
        locations = face_recognition.face_locations(img_array)
    except Exception as e:
        return {"status": 500, "msg": f"人脸检测异常：{e}"}

    if len(locations) == 0:
        return {"status": 500, "msg": "未检测到人脸，请调整位置"}

    # 提取特征
    encodings = face_recognition.face_encodings(img_array, locations)
    if len(encodings) == 0:
        return {"status": 500, "msg": "无法提取人脸特征"}

    # 遍历所有已注册人脸进行比对
    matched_uid = None
    for face_file in sorted(FACES_DIR.glob("*.jpg")):
        try:
            known_img = face_recognition.load_image_file(str(face_file))
            known_loc = face_recognition.face_locations(known_img)
            if len(known_loc) == 0:
                continue
            known_enc = face_recognition.face_encodings(known_img, known_loc)
            if len(known_enc) == 0:
                continue
            matches = face_recognition.compare_faces(known_enc, encodings[0], tolerance=0.4)
            if any(matches):
                matched_uid = int(face_file.stem)
                break
        except Exception:
            continue

    if matched_uid is None:
        return {"status": 500, "msg": "人脸识别失败，未找到匹配用户"}

    # 查数据库
    row = query_one(
        "SELECT user_id, user_name FROM user_info WHERE user_id=%s",
        (matched_uid,),
    )
    if not row:
        return {"status": 500, "msg": "未找到用户信息"}

    return {"status": 200, "msg": "人脸登录成功", "user_id": row[0], "user_name": row[1]}


# ═══════════════════════════════════════════════════════
# 健康检查
# ═══════════════════════════════════════════════════════
@app.get("/api/auth/health")
def health():
    return {"status": "ok", "service": "auth", "registered_users": len(list(FACES_DIR.glob("*.jpg")))}


# ── 启动 ────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
