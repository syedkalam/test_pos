package db

import (
	"database/sql"
	"os"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Open() error {
	path := os.Getenv("DB_PATH")
	if path == "" {
		path = "./store.db"
	}

	var err error
	DB, err = sql.Open("sqlite", path)
	if err != nil {
		return err
	}

	if err := DB.Ping(); err != nil {
		return err
	}

	return createSchema(DB)
}

func createSchema(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			parent_id INTEGER REFERENCES categories(id),
			version INTEGER NOT NULL DEFAULT 1,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			version INTEGER NOT NULL DEFAULT 1,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			price REAL NOT NULL,
			category_id INTEGER NOT NULL REFERENCES categories(id),
			version INTEGER NOT NULL DEFAULT 1,
			cursor TEXT NOT NULL,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS product_tags (
			product_id INTEGER NOT NULL REFERENCES products(id),
			tag_id INTEGER NOT NULL REFERENCES tags(id),
			PRIMARY KEY (product_id, tag_id)
		)`,
		`CREATE TABLE IF NOT EXISTS carts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			device_id TEXT NOT NULL UNIQUE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS cart_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			cart_id INTEGER NOT NULL REFERENCES carts(id),
			product_id INTEGER NOT NULL REFERENCES products(id),
			quantity INTEGER NOT NULL DEFAULT 1,
			note TEXT,
			scheduled_delivery DATETIME,
			UNIQUE(cart_id, product_id)
		)`,
		`CREATE TABLE IF NOT EXISTS orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			cart_id INTEGER NOT NULL REFERENCES carts(id),
			status TEXT NOT NULL DEFAULT 'draft',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS payments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			order_id INTEGER NOT NULL REFERENCES orders(id),
			status TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_products_cursor ON products(cursor)`,
		`CREATE INDEX IF NOT EXISTS idx_products_version ON products(version)`,
		`CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	return nil
}
