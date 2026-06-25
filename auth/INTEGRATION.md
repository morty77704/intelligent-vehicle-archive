# Auth Agent — 集成说明

## 服务信息

- **端口**: 8004
- **目录**: `auth/`
- **启动**: `cd auth && python api/main.py`

## API 接口

### 1. 人脸注册

```
POST /api/auth/register
Content-Type: application/json

{
  "image": "base64编码的图片（含data:image/jpeg;base64,前缀）",
  "name": "张三",
  "age": "25",
  "phone": "13800138000",
  "password": "123456"
}

// 成功
{ "status": 200, "msg": "注册成功（用户ID: 42）", "user_id": 42 }
// 重复注册
{ "status": 201, "msg": "该用户已采集过人脸信息" }
// 失败
{ "status": 500, "msg": "未检测到人脸，请调整位置" }
```

### 2. 手机号+密码登录

```
POST /api/auth/login/password
Content-Type: application/json

{
  "phone": "13800138000",
  "password": "123456"
}

// 成功
{ "status": 200, "msg": "登录成功", "user_id": 42, "user_name": "张三" }
// 失败
{ "status": 500, "msg": "密码错误" }
{ "status": 404, "msg": "该手机号未注册" }
```

### 3. 人脸登录

```
POST /api/auth/login/face
Content-Type: application/json

{
  "image": "base64编码的图片"
}

// 成功
{ "status": 200, "msg": "人脸登录成功", "user_id": 42, "user_name": "张三" }
// 失败
{ "status": 500, "msg": "人脸识别失败，未找到匹配用户" }
```

### 4. 健康检查

```
GET /api/auth/health
{ "status": "ok", "service": "auth", "registered_users": 3 }
```

## 数据库要求

需要 MySQL 数据库，配置在 `auth/utils/db_util.py` 中：

```python
DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "passwd": "123456",
    "database": "user_info",
}
```

表结构：
```sql
CREATE TABLE IF NOT EXISTS user_info (
    user_id     INT PRIMARY KEY,
    user_name   VARCHAR(100),
    user_age    VARCHAR(10),
    user_phone  VARCHAR(11),
    user_password VARCHAR(100)
);
```

## 前端对接

1. 注册页面 → 调用 `/api/auth/register`
2. 账密登录 → 调用 `/api/auth/login/password`
3. 人脸登录 → 调用 `/api/auth/login/face`
4. 登录成功后前端存储 `user_id` 和 `user_name`
5. 后续请求（如分析车辆）带上 `user_id`/`user_name` 参数
