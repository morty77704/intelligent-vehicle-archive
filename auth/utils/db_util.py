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


def get_conn():
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
