"""MySQL 数据库工具模块"""
import pymysql

DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "passwd": "123456",
    "database": "user_info",
    "charset": "utf8",
}

_INITIALIZED = False


def init_db():
    global _INITIALIZED
    if _INITIALIZED:
        return

    server_config = {k: v for k, v in DB_CONFIG.items() if k != "database"}
    conn = pymysql.connect(**server_config)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "CREATE DATABASE IF NOT EXISTS user_info "
                "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            cur.execute("USE user_info")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_info (
                    user_id INT PRIMARY KEY,
                    user_name VARCHAR(100) NOT NULL,
                    user_age VARCHAR(20) NOT NULL,
                    user_phone VARCHAR(20) NOT NULL UNIQUE,
                    user_password VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        conn.commit()
        _INITIALIZED = True
    finally:
        conn.close()


def get_conn():
    init_db()
    return pymysql.connect(**DB_CONFIG)


def query_one(sql, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()
    finally:
        conn.close()


def query_all(sql, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


def insert(sql, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return True
    except Exception as e:
        conn.rollback()
        print(f"数据库插入失败：{e}")
        return False
    finally:
        conn.close()
