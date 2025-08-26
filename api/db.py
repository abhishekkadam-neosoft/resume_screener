import mysql.connector
from mysql.connector import MySQLConnection
from dotenv import load_dotenv
import os

# load env file
load_dotenv()

def get_connection() -> MySQLConnection:
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        database=os.getenv("DB_NAME"),
    )
