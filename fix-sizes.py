import sqlite3
import os

db = sqlite3.connect('media.db')
cur = db.cursor()

# Movies
for row in cur.execute("SELECT id, path FROM files").fetchall():
    try:
        size = os.path.getsize(row[1])
        cur.execute("UPDATE files SET size_bytes = ? WHERE id = ?", (size, row[0]))
    except:
        pass

# Episodes
for row in cur.execute("SELECT id, path FROM episode_files").fetchall():
    try:
        size = os.path.getsize(row[1])
        cur.execute("UPDATE episode_files SET size_bytes = ? WHERE id = ?", (size, row[0]))
    except:
        pass

db.commit()
print("Sizes updated")
