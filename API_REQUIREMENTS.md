# API Requirements for Online Raithu Bazaar (Cloudflare Architecture)

This document outlines the API requirements necessary to implement the next development phases of the Online Raithu Bazaar application. The APIs are implemented using an all-Cloudflare architecture with the following components:

- **Cloudflare Workers** with **Hono Framework** for API implementation
- **D1 Database** (SQLite at the edge) for data storage
- **R2** for image/file storage
- **Workers KV** for translations and caching
- **Durable Objects** for transactional consistency
- **Queues** for background processing
- **Analytics Engine** for metrics and analytics

All API endpoints will be prefixed with `/api/v1`.

## Authentication APIs

The authentication system is implemented using Cloudflare Workers with JWT tokens stored in D1 Database:

#### Login
- **Endpoint**: `/api/v1/auth/log-in`
- **Method**: POST
- **Input**:
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response**:
  ```json
  {
    "accessToken": "string",
    "expiresIn": "number",
    "user": {
      "id": "string",
      "email": "string",
      "name": "string",
      "role": "string", // "farmer" or "consumer"
      "profileCompleted": "boolean"
    }
  }
  ```
- **Implementation**: Uses bcrypt for password verification and JWT for token generation

#### Signup
- **Endpoint**: `/api/v1/auth/sign-up`
- **Method**: POST
- **Input**:
  ```json
  {
    "email": "string",
    "password": "string",
    "name": "string",
    "role": "string" // "farmer" or "consumer"
  }
  ```
- **Response**:
  ```json
  {
    "accessToken": "string",
    "expiresIn": "number",
    "user": {
      "id": "string",
      "email": "string",
      "name": "string",
      "role": "string", // "farmer" or "consumer"
      "profileCompleted": "boolean"
    }
  }
  ```
- **Implementation**: Uses D1 Database for user storage and bcrypt for password hashing

#### Logout
- **Endpoint**: `/api/v1/auth/logout`
- **Method**: POST
- **Input**: None required
- **Response**:
  ```json
  {
    "success": true,
    "message": "Successfully logged out"
  }
  ```
- **Implementation**: Token invalidation (client-side)

#### Get Current User
- **Endpoint**: `/api/v1/users/me`
- **Method**: GET
- **Response**:
  ```json
  {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string", // "farmer" or "consumer"
    "profileCompleted": "boolean",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Implementation**: JWT authentication middleware

#### Update User Role
- **Endpoint**: `/api/v1/users/me/role`
- **Method**: PUT
- **Input**:
  ```json
  {
    "role": "string" // "farmer" or "consumer"
  }
  ```
- **Response**:
  ```json
  {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "updatedAt": "timestamp"
  }
  ```
- **Implementation**: D1 Database update operation

## Farmer Profile APIs

### Create/Update Farmer Profile
- **Endpoint**: `/api/v1/farmers/profile`
- **Method**: POST/PUT
- **Input**:
  ```json
  {
    "farmerName": "string",
    "farmName": "string",
    "location": {
      "village": "string",
      "district": "string",
      "state": "string",
      "pincode": "string"
    },
    "contactNumber": "string",
    "profilePicture": "file/base64string",
    "description": "string"
  }
  ```
- **Response**:
  ```json
  {
    "id": "string",
    "farmerName": "string",
    "farmName": "string",
    "location": {
      "village": "string",
      "district": "string",
      "state": "string",
      "pincode": "string"
    },
    "contactNumber": "string",
    "profilePictureUrl": "string",
    "description": "string",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Implementation**: D1 Database for profile data, R2 for profile picture storage

### Get Farmer Profile
- **Endpoint**: `/api/v1/farmers/profile/:id`
- **Method**: GET
- **Response**:
  ```json
  {
    "id": "string",
    "farmerName": "string",
    "farmName": "string",
    "location": {
      "village": "string",
      "district": "string", 
      "state": "string",
      "pincode": "string"
    },
    "contactNumber": "string",
    "profilePictureUrl": "string",
    "description": "string",
    "createdAt": "timestamp",
    "updatedAt": "timestamp",
    "products": [
      {
        "id": "string",
        "name": {
          "english": "string",
          "telugu": "string"
        },
        "thumbnail": "string",
        "price": "number"
      }
    ]
  }
  ```
- **Implementation**: D1 Database with SQL JOIN for products, R2 for image URLs

### Get Current Farmer Profile
- **Endpoint**: `/api/v1/farmers/profile/me`
- **Method**: GET
- **Response**: Same as Get Farmer Profile
- **Implementation**: JWT token for user identification + D1 lookup

## Product Management APIs

### Create Product
- **Endpoint**: `/api/v1/products`
- **Method**: POST
- **Input**:
  ```json
  {
    "name": {
      "english": "string",
      "telugu": "string"
    },
    "description": {
      "english": "string",
      "telugu": "string"
    },
    "category": "string",
    "price": "number",
    "unit": "string",
    "quantity": "number",
    "images": ["file/base64string"],
    "harvestedDate": "date",
    "availableFrom": "date",
    "availableTo": "date"
  }
  ```
- **Response**:
  ```json
  {
    "id": "string",
    "farmerId": "string",
    "name": {
      "english": "string",
      "telugu": "string"
    },
    "description": {
      "english": "string",
      "telugu": "string"
    },
    "category": "string",
    "price": "number",
    "unit": "string",
    "quantity": "number",
    "imageUrls": ["string"],
    "harvestedDate": "date",
    "availableFrom": "date",
    "availableTo": "date",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Implementation**: D1 Database for product data, R2 for product images

### Update Product
- **Endpoint**: `/api/v1/products/:id`
- **Method**: PUT
- **Input**: Same as Create Product
- **Response**: Same as Create Product response
- **Implementation**: D1 Database update operations, R2 for image management

### Delete Product
- **Endpoint**: `/api/v1/products/:id`
- **Method**: DELETE
- **Response**:
  ```json
  {
    "success": true,
    "message": "Product deleted successfully"
  }
  ```
- **Implementation**: D1 Database transaction, R2 for image deletion

### Get Product
- **Endpoint**: `/api/v1/products/:id`
- **Method**: GET
- **Response**:
  ```json
  {
    "id": "string",
    "name": {
      "english": "string",
      "telugu": "string"
    },
    "description": {
      "english": "string",
      "telugu": "string"
    },
    "category": "string",
    "price": "number",
    "unit": "string",
    "quantity": "number",
    "imageUrls": ["string"],
    "harvestedDate": "date",
    "availableFrom": "date",
    "availableTo": "date",
    "farmer": {
      "id": "string",
      "farmerName": "string",
      "farmName": "string",
      "location": {
        "village": "string",
        "district": "string"
      },
      "profilePictureUrl": "string"
    },
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
  ```
- **Implementation**: D1 Database JOIN query, R2 for image URLs

### List Farmer Products
- **Endpoint**: `/api/v1/farmers/:id/products`
- **Method**: GET
- **Query Parameters**:
  - `page`: number
  - `limit`: number
  - `sortBy`: string (price, date, etc.)
  - `order`: string (asc, desc)
- **Response**:
  ```json
  {
    "products": [
      {
        "id": "string",
        "name": {
          "english": "string",
          "telugu": "string"
        },
        "price": "number",
        "unit": "string",
        "quantity": "number",
        "thumbnailUrl": "string",
        "availableFrom": "date",
        "availableTo": "date"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "limit": "number",
      "pages": "number"
    }
  }
  ```
- **Implementation**: D1 Database with pagination and sorting

### List My Products
- **Endpoint**: `/api/v1/farmers/me/products`
- **Method**: GET
- **Query Parameters**: Same as List Farmer Products
- **Response**: Same as List Farmer Products
- **Implementation**: JWT token for farmer identification + D1 query

## Consumer Interface APIs

### List Products
- **Endpoint**: `/api/v1/products`
- **Method**: GET
- **Query Parameters**:
  - `page`: number
  - `limit`: number
  - `category`: string
  - `minPrice`: number
  - `maxPrice`: number
  - `sortBy`: string (price, date)
  - `order`: string (asc, desc)
  - `farmerLocation`: string (village, district)
- **Response**:
  ```json
  {
    "products": [
      {
        "id": "string",
        "name": {
          "english": "string",
          "telugu": "string"
        },
        "price": "number",
        "unit": "string",
        "thumbnailUrl": "string",
        "farmer": {
          "id": "string",
          "farmerName": "string",
          "farmName": "string", 
          "location": {
            "village": "string"
          }
        }
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "limit": "number",
      "pages": "number"
    }
  }
  ```
- **Implementation**: D1 Database with filtering, sorting, and pagination

### Search Products
- **Endpoint**: `/api/v1/products/search`
- **Method**: GET
- **Query Parameters**:
  - `query`: string
  - `page`: number
  - `limit`: number
  - `filter`: string (farmer, location, product)
  - `language`: string (english, telugu, both)
- **Response**: Same as List Products
- **Implementation**: D1 Database with LIKE queries and proper indexing

### Get Categories
- **Endpoint**: `/api/v1/categories`
- **Method**: GET
- **Response**:
  ```json
  {
    "categories": [
      {
        "id": "string",
        "name": {
          "english": "string",
          "telugu": "string"
        },
        "imageUrl": "string"
      }
    ]
  }
  ```
- **Implementation**: D1 Database for categories, R2 for category images

## Order Management APIs

### Create Order
- **Endpoint**: `/api/v1/orders`
- **Method**: POST
- **Input**:
  ```json
  {
    "items": [
      {
        "productId": "string",
        "quantity": "number"
      }
    ],
    "deliveryAddress": {
      "addressLine1": "string",
      "addressLine2": "string",
      "village": "string",
      "district": "string",
      "state": "string",
      "pincode": "string"
    },
    "contactNumber": "string",
    "paymentMethod": "string"
  }
  ```
- **Response**:
  ```json
  {
    "id": "string",
    "orderNumber": "string",
    "items": [
      {
        "productId": "string",
        "productName": {
          "english": "string",
          "telugu": "string"
        },
        "quantity": "number",
        "unitPrice": "number",
        "totalPrice": "number"
      }
    ],
    "subtotal": "number",
    "deliveryFee": "number",
    "totalAmount": "number",
    "status": "string",
    "deliveryAddress": {
      "addressLine1": "string",
      "addressLine2": "string",
      "village": "string",
      "district": "string",
      "state": "string",
      "pincode": "string"
    },
    "contactNumber": "string",
    "paymentMethod": "string",
    "paymentStatus": "string",
    "createdAt": "timestamp"
  }
  ```
- **Implementation**: Durable Objects for transactional consistency, D1 Database for order storage, Queues for order processing

### Get Order
- **Endpoint**: `/api/v1/orders/:id`
- **Method**: GET
- **Response**: Same as Create Order response
- **Implementation**: D1 Database with JOIN queries

### List My Orders (Consumer)
- **Endpoint**: `/api/v1/orders/my-orders`
- **Method**: GET
- **Query Parameters**:
  - `page`: number
  - `limit`: number
  - `status`: string
- **Response**:
  ```json
  {
    "orders": [
      {
        "id": "string",
        "orderNumber": "string",
        "totalAmount": "number",
        "status": "string",
        "items": [
          {
            "productName": {
              "english": "string",
              "telugu": "string"
            },
            "quantity": "number"
          }
        ],
        "createdAt": "timestamp"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "limit": "number",
      "pages": "number"
    }
  }
  ```
- **Implementation**: JWT token for user identification + D1 Database queries with pagination

### List Farmer Orders
- **Endpoint**: `/api/v1/farmers/me/orders`
- **Method**: GET
- **Query Parameters**: Same as List My Orders
- **Response**:
  ```json
  {
    "orders": [
      {
        "id": "string",
        "orderNumber": "string",
        "buyerName": "string",
        "totalAmount": "number",
        "status": "string",
        "items": [
          {
            "productId": "string",
            "productName": {
              "english": "string", 
              "telugu": "string"
            },
            "quantity": "number",
            "unitPrice": "number",
            "totalPrice": "number"
          }
        ],
        "createdAt": "timestamp"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "limit": "number",
      "pages": "number"
    }
  }
  ```
- **Implementation**: JWT token for farmer identification + D1 Database queries with JOINs

### Update Order Status (Farmer)
- **Endpoint**: `/api/v1/orders/:id/status`
- **Method**: PUT
- **Input**:
  ```json
  {
    "status": "string" 
  }
  ```
- **Response**:
  ```json
  {
    "id": "string",
    "status": "string",
    "updatedAt": "timestamp"
  }
  ```
- **Implementation**: D1 Database update + Queues for notifications

## Analytics APIs (Farmer Dashboard)

### Get Sales Overview
- **Endpoint**: `/api/v1/farmers/me/analytics/sales`
- **Method**: GET
- **Query Parameters**:
  - `period`: string (daily, weekly, monthly, yearly)
  - `startDate`: date
  - `endDate`: date
- **Response**:
  ```json
  {
    "totalSales": "number",
    "totalOrders": "number",
    "averageOrderValue": "number",
    "salesByPeriod": [
      {
        "period": "string",
        "sales": "number",
        "orders": "number"
      }
    ],
    "topSellingProducts": [
      {
        "id": "string",
        "name": {
          "english": "string",
          "telugu": "string"
        },
        "quantity": "number",
        "totalSales": "number"
      }
    ]
  }
  ```
- **Implementation**: Analytics Engine for metrics collection and querying

## Multilingual Support APIs

### Get Translations
- **Endpoint**: `/api/v1/translations`
- **Method**: GET
- **Query Parameters**:
  - `language`: string (english, telugu)
  - `section`: string (optional, to get specific section)
- **Response**:
  ```json
  {
    "translations": {
      "common": {
        "search": "string",
        "filter": "string"
      },
      "product": {
        "price": "string",
        "quantity": "string"
      }
    }
  }
  ```
- **Implementation**: Workers KV for storing and retrieving translations

## User Preference APIs

### Set Language Preference
- **Endpoint**: `/api/v1/users/me/preferences/language`
- **Method**: PUT
- **Input**:
  ```json
  {
    "language": "string", // "english", "telugu", "both"
    "productNamesDisplay": "string" // "telugu_only", "english_only", "both"
  }
  ```
- **Response**:
  ```json
  {
    "preferences": {
      "language": "string",
      "productNamesDisplay": "string"
    }
  }
  ```
- **Implementation**: D1 Database for user preferences

### Get User Preferences
- **Endpoint**: `/api/v1/users/me/preferences`
- **Method**: GET
- **Response**:
  ```json
  {
    "preferences": {
      "language": "string",
      "productNamesDisplay": "string",
      "notifications": {
        "orderUpdates": "boolean",
        "newProducts": "boolean"
      }
    }
  }
  ```
- **Implementation**: D1 Database query

## Error Handling

All API responses include appropriate HTTP status codes and error messages:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "object (optional)"
  }
}
```

## Authentication Requirements

All APIs except public endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### Role-Based Access Control

The application implements role-based access control with the following permissions, implemented via JWT verification and middleware in Cloudflare Workers:

1. **Farmer Role**:
   - Full access to their own farmer profile
   - Full access to create, update, and delete their own products
   - Access to view their orders and update order status
   - Access to their sales analytics

2. **Consumer Role**:
   - Access to browse all products
   - Access to search for products and farmers
   - Access to place orders
   - Access to view their own order history

3. **Public (Unauthenticated)**:
   - Access to browse products
   - Access to search for products and farmers
   - Access to view product details
   - Access to authentication endpoints

## Offline Support

For offline support, the API implements:

1. **ETags** for efficient caching
2. **Last-Modified** headers for data synchronization
3. **Batch processing** endpoints for syncing multiple records after reconnection:

### Sync Data
- **Endpoint**: `/api/v1/sync`
- **Method**: POST
- **Input**:
  ```json
  {
    "lastSyncTimestamp": "timestamp",
    "entities": ["products", "orders"],
    "offlineActions": [
      {
        "entity": "string",
        "action": "string",
        "data": "object",
        "timestamp": "timestamp"
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "syncTimestamp": "timestamp",
    "updatedEntities": {
      "products": ["object"],
      "orders": ["object"]
    },
    "conflicts": [
      {
        "entity": "string",
        "id": "string",
        "serverData": "object",
        "clientData": "object"
      }
    ]
  }
  ```
- **Implementation**: D1 Database for differential data retrieval, Durable Objects for conflict resolution

## Deployment

The API is deployed using Cloudflare Workers with the following configuration:

1. **Wrangler CLI** for deployment management
2. **D1 Database** for persistent storage
3. **R2** for file storage
4. **KV** for translations and caching
5. **Durable Objects** for transactions
6. **Queues** for background processing
7. **Analytics Engine** for metrics

See the `wrangler.toml` file for complete configuration details. 