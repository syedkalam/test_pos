package models

import "time"

type Category struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	ParentID  *int64     `json:"parent_id,omitempty"`
	Version   int64      `json:"version"`
	UpdatedAt time.Time  `json:"updated_at"`
	Children  []Category `json:"children,omitempty"`
}

type Tag struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Version   int64     `json:"version"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Product struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	CategoryID  int64     `json:"category_id"`
	Version     int64     `json:"version"`
	Cursor      string    `json:"cursor"`
	UpdatedAt   time.Time `json:"updated_at"`
	Tags        []Tag     `json:"tags,omitempty"`
	Category    *Category `json:"category,omitempty"`
}

type Cart struct {
	ID        int64      `json:"id"`
	DeviceID  string     `json:"device_id"`
	CreatedAt time.Time  `json:"created_at"`
	Items     []CartItem `json:"items,omitempty"`
}

type CartItem struct {
	ID                int64      `json:"id"`
	CartID            int64      `json:"cart_id"`
	ProductID         int64      `json:"product_id"`
	Quantity          int        `json:"quantity"`
	Note              *string    `json:"note,omitempty"`
	ScheduledDelivery *time.Time `json:"scheduled_delivery,omitempty"`
	Product           *Product   `json:"product,omitempty"`
}

type Order struct {
	ID        int64     `json:"id"`
	CartID    int64     `json:"cart_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type Payment struct {
	ID        int64     `json:"id"`
	OrderID   int64     `json:"order_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type SyncEvent struct {
	Type      string    `json:"type"`
	EntityID  int64     `json:"entity_id"`
	Version   int64     `json:"version"`
	UpdatedAt time.Time `json:"updated_at"`
}

type BumpRequest struct {
	ExpectedVersion int64 `json:"expected_version"`
}

type CartActionRequest struct {
	Action            string     `json:"action"`
	ProductID         int64      `json:"product_id"`
	Quantity          int        `json:"quantity"`
	Note              *string    `json:"note,omitempty"`
	ScheduledDelivery *time.Time `json:"scheduled_delivery,omitempty"`
	DeviceID          string     `json:"device_id"`
}

type ProductsResponse struct {
	Data       []Product `json:"data"`
	NextCursor *string   `json:"next_cursor"`
	TotalCount int64     `json:"total_count"`
}

type SyncResponse struct {
	Products   []SyncEvent `json:"products"`
	Categories []SyncEvent `json:"categories"`
	Tags       []SyncEvent `json:"tags"`
}
