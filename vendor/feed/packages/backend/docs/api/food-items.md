# Food Items API

The Food Items API provides endpoints for managing food items in the pantry inventory.

## Endpoints

- [Get All Food Items](#get-all-food-items)
- [Get Food Item Distribution](#get-food-item-distribution)
- [Get Single Food Item](#get-single-food-item)
- [Create Food Item](#create-food-item)
- [Update Food Item](#update-food-item)
- [Delete Food Item](#delete-food-item)
- [Bulk Update Food Items](#bulk-update-food-items)
- [Bulk Delete Food Items](#bulk-delete-food-items)

## Get All Food Items

Returns a list of all food items sorted alphabetically by name.

### Endpoint

```
GET /api/food-items
```

### Response

```json
{
  "foodItems": [
    {
      "id": 1,
      "name": "Canned Beans",
      "limit": 10,
      "limitType": "household",
      "category": {
        "id": 1,
        "name": "Canned Goods"
      },
      "status": "in_stock",
      "statusFlags": {
        "isInStock": true,
        "isLimited": false,
        "isClearance": false
      },
      "dietaryFlags": {
        "vegan": true,
        "vegetarian": true,
        "glutenFree": true,
        "organic": false,
        "halal": true,
        "kosher": true,
        "readyToEat": false
      },
      "createdAt": "2025-05-01T12:00:00.000Z",
      "updatedAt": "2025-05-01T12:00:00.000Z"
    }
    // More food items...
  ]
}
```

## Get Food Item Distribution

Returns the distribution of food items by status for visualization.

### Endpoint

```
GET /api/food-items/distribution
```

### Response

```json
{
  "distribution": [
    {
      "status": "inStock",
      "items": 42,
      "fill": "var(--color-inStock)"
    },
    {
      "status": "limited",
      "items": 15,
      "fill": "var(--color-limited)"
    },
    {
      "status": "clearance",
      "items": 8,
      "fill": "var(--color-clearance)"
    },
    {
      "status": "outOfStock",
      "items": 12,
      "fill": "var(--color-outOfStock)"
    }
  ],
  "totalItems": 65
}
```

## Get Single Food Item

Returns detailed information about a specific food item.

### Endpoint

```
GET /api/food-items/:id
```

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | number | The ID of the food item |

### Response

```json
{
  "foodItem": {
    "id": 1,
    "name": "Canned Beans",
    "limit": 10,
    "limitType": "household",
    "category": {
      "id": 1,
      "name": "Canned Goods"
    },
    "status": "in_stock",
    "statusFlags": {
      "isInStock": true,
      "isLimited": false,
      "isClearance": false
    },
    "dietaryFlags": {
      "vegan": true,
      "vegetarian": true,
      "glutenFree": true,
      "organic": false,
      "halal": true,
      "kosher": true,
      "readyToEat": false
    },
    "createdAt": "2025-05-01T12:00:00.000Z",
    "updatedAt": "2025-05-01T12:00:00.000Z"
  }
}
```

### Error Responses

- `404 Not Found`: Food item with the specified ID does not exist

## Create Food Item

Creates a new food item.

### Endpoint

```
POST /api/food-items
```

### Request Body

```json
{
  "name": "Canned Beans",
  "limit": 10,
  "limitType": "household",
  "categoryId": 1,
  "statusFlags": {
    "isInStock": true,
    "isLimited": false,
    "isClearance": false
  },
  "dietaryFlags": {
    "vegan": true,
    "vegetarian": true,
    "glutenFree": true,
    "organic": false,
    "halal": true,
    "kosher": true,
    "readyToEat": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Name of the food item (3-36 characters) |
| `limit` | number | No | Maximum quantity allowed (1-100) |
| `limitType` | string | No | "person" or "household" (default: "household") |
| `categoryId` | number | Yes | ID of the category this item belongs to |
| `statusFlags` | object | No | Status flags (default: `{"isInStock": true, "isLimited": false, "isClearance": false}`) |
| `dietaryFlags` | object | No | Dietary flags (all default to `false`) |

### Response

```json
{
  "foodItem": {
    "id": 1,
    "name": "Canned Beans",
    "limit": 10,
    "limitType": "household",
    "category": {
      "id": 1,
      "name": "Canned Goods"
    },
    "status": "in_stock",
    "statusFlags": {
      "isInStock": true,
      "isLimited": false,
      "isClearance": false
    },
    "dietaryFlags": {
      "vegan": true,
      "vegetarian": true,
      "glutenFree": true,
      "organic": false,
      "halal": true,
      "kosher": true,
      "readyToEat": false
    },
    "createdAt": "2025-05-16T12:00:00.000Z",
    "updatedAt": "2025-05-16T12:00:00.000Z"
  }
}
```

### Status Codes

- `201 Created`: Food item successfully created
- `400 Bad Request`: Invalid request body
- `404 Not Found`: Category with specified ID does not exist
- `409 Conflict`: Food item with the same name already exists

## Update Food Item

Updates an existing food item.

### Endpoint

```
PUT /api/food-items/:id
```

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | number | The ID of the food item to update |

### Request Body

```json
{
  "name": "Updated Beans",
  "limit": 15,
  "limitType": "person",
  "categoryId": 2,
  "statusFlags": {
    "isInStock": true,
    "isLimited": true,
    "isClearance": false
  },
  "dietaryFlags": {
    "vegan": true,
    "vegetarian": true,
    "glutenFree": true,
    "organic": true,
    "halal": true,
    "kosher": true,
    "readyToEat": false
  },
  "keepTranslations": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated name (3-36 characters) |
| `limit` | number | No | Updated limit (1-100) |
| `limitType` | string | No | Updated limit type ("person" or "household") |
| `categoryId` | number | No | Updated category ID |
| `statusFlags` | object | No | Updated status flags |
| `dietaryFlags` | object | No | Updated dietary flags |
| `keepTranslations` | boolean | No | Whether to keep translations after name change |

### Response

```json
{
  "foodItem": {
    "id": 1,
    "name": "Updated Beans",
    "limit": 15,
    "limitType": "person",
    "category": {
      "id": 2,
      "name": "Organic"
    },
    "status": "limited",
    "statusFlags": {
      "isInStock": true,
      "isLimited": true,
      "isClearance": false
    },
    "dietaryFlags": {
      "vegan": true,
      "vegetarian": true,
      "glutenFree": true,
      "organic": true,
      "halal": true,
      "kosher": true,
      "readyToEat": false
    },
    "createdAt": "2025-05-01T12:00:00.000Z",
    "updatedAt": "2025-05-16T12:34:56.789Z"
  }
}
```

### Status Codes

- `200 OK`: Food item successfully updated
- `400 Bad Request`: Invalid request body
- `404 Not Found`: Food item or category not found
- `409 Conflict`: Updated name conflicts with existing food item

## Delete Food Item

Deletes a food item and its translations.

### Endpoint

```
DELETE /api/food-items/:id
```

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | number | The ID of the food item to delete |

### Response

No content (204) on successful deletion.

### Status Codes

- `204 No Content`: Food item successfully deleted
- `400 Bad Request`: Invalid ID format
- `404 Not Found`: Food item not found

## Bulk Update Food Items

Updates multiple food items at once.

### Endpoint

```
PUT /api/food-items/bulk
```

### Request Body

```json
{
  "ids": [1, 2, 3],
  "updates": {
    "categoryId": 2,
    "statusFlags": {
      "isInStock": true,
      "isLimited": true
    },
    "dietaryFlags": {
      "organic": true
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | number[] | Yes | Array of food item IDs to update |
| `updates` | object | Yes | Fields to update (same as single update) |

### Response

```json
{
  "foodItems": [
    {
      "id": 1,
      "name": "Canned Beans",
      // Other updated food item properties
    },
    // More updated food items...
  ]
}
```

### Status Codes

- `200 OK`: Food items successfully updated
- `400 Bad Request`: Invalid request body
- `404 Not Found`: One or more food items or category not found

## Bulk Delete Food Items

Deletes multiple food items at once.

### Endpoint

```
DELETE /api/food-items/bulk
```

### Request Body

```json
{
  "ids": [1, 2, 3]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | number[] | Yes | Array of food item IDs to delete |

### Response

No content (204) on successful deletion.

### Status Codes

- `204 No Content`: Food items successfully deleted
- `400 Bad Request`: Invalid request body
- `404 Not Found`: One or more food items not found