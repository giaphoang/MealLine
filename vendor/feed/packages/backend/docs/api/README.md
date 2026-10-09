# FEED Backend API Documentation

This documentation provides detailed information about the FEED backend API endpoints, their parameters, responses, and error handling.

## Contents

- [Authentication](#authentication)
- [Food Items API](./food-items.md)
- [Categories API](./categories.md)
- [Translations API](./translations.md)
- [Languages API](./languages.md)
- [Documents API](./documents.md)
- [Shopping Lists API](./shopping-lists.md)
- [Global Limit API](./global-limit.md)
- [Custom Texts API](./custom-texts.md)

## Authentication

All API endpoints (except health checks) require HTTP Basic Authentication.

### Headers

```
Authorization: Basic base64(username:password)
```

Credentials are supplied via the `AUTH_USERNAME` / `AUTH_PASSWORD`
environment variables (Basic Auth is disabled when they are unset):
- Username: `<AUTH_USERNAME>`
- Password: `<AUTH_PASSWORD>`

### Example

```bash
# Using curl with authentication
curl -X GET http://localhost:3001/api/food-items \
  -H "Authorization: Basic $(printf '%s' \"$AUTH_USERNAME:$AUTH_PASSWORD\" | base64)"
```

### Public Endpoints

The following endpoints do not require authentication:

- `GET /health` - Basic server health check
- `GET /api/health` - API health check with more details

## Error Handling

All API endpoints follow a consistent error format:

```json
{
  "error": {
    "message": "Error message description",
    "code": "ERROR_CODE",
    "timestamp": "2025-05-16T12:34:56.789Z"
  }
}
```

### Common Error Codes

- `AUTH_REQUIRED` - Authentication is required (401)
- `INVALID_CREDENTIALS` - Invalid username or password (401)
- `NOT_FOUND` - Resource not found (404)
- `VALIDATION_ERROR` - Invalid request data (400)
- `CONFLICT` - Resource already exists (409)
- `INTERNAL_ERROR` - Server error (500)

## Rate Limiting

API requests are subject to rate limiting:
- 100 requests per minute
- Additional headers indicate rate limit status:
  - `X-RateLimit-Limit`: Maximum requests per minute
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time until rate limit resets (seconds)
