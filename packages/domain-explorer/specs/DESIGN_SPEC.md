# DDD Explorer — Design Specification

> Figma source: <https://www.figma.com/design/5xKQ6BS1OZNJwAfcRvyD47>

## Overview

DDD Explorer is a web application for visualizing Domain-Driven Design domain models. Users navigate a hierarchy of aggregates, entities, behaviors, events, and errors by clicking on color-coded blocks, drilling down layer by layer.

The app has two navigation paths:

- Domain Model — bottom-up exploration: Aggregates → Aggregate internals → Entity behaviors → Events & Errors
- Use Cases — top-down exploration: Use Cases list → Use Case detail (with links back to Domain Model)

---

## Screens

### Screen 1: Aggregates & Entities (Entry Point)

File: designs/01-aggregates-entities.png
Route: /domain-model

The landing page showing all aggregates and root entities in the domain model.

Content:

| Name | Type | Description | Stats |
|------|------|-------------|-------|
| Order | Aggregate | Manages customer orders, line items, and fulfillment lifecycle. Contains Order, OrderLine entities and Money, Address value objects. | 6 Behaviors · 4 Events · 3 Errors |
| Cart | Aggregate | Temporary shopping cart with session-scoped items and promotions. | 4 Behaviors · 2 Events · 1 Error |
| Customer | Entity | Core customer profile with authentication and preferences. | 5 Behaviors · 3 Events · 2 Errors |
| Product | Aggregate | Product catalog with variants, pricing rules, and inventory tracking. | 7 Behaviors · 5 Events · 2 Errors |
| Payment | Aggregate | Payment processing, authorization, and refund handling. | 4 Behaviors · 3 Events · 3 Errors |
| Shipment | Entity | Tracks shipment status, carrier integration, and delivery confirmation. | 3 Behaviors · 2 Events · 1 Error |

Cards are displayed in a 2×3 grid. Each card has:

- Yellow left border accent
- Name with AGG or ENT badge
- Description text
- Stats row (behaviors, events, errors counts)
- "EXPLORE →" link

---

### Screen 2: Aggregate Internals (Order Aggregate)

File: designs/02-order-aggregate.png
Route: /domain-model/order
Breadcrumb: Domain Model > Order

Shows the internals of the Order Aggregate: its behaviors, sub-entities, and value objects.

Behaviors (blue/indigo left border):

| Name | Description | Stats |
|------|-------------|-------|
| placeOrder() | Validates inventory and creates a new order. | 2 Events · 1 Error |
| shipOrder() | Updates status and emits shipping confirmation. | 1 Event · 1 Error |
| cancelOrder() | Reverts state and notifies downstream services. | 1 Event · 1 Error |
| addProduct() | Adds a new line item and recalculates totals. | 1 Event · 1 Error |

Entities (golden yellow left border):

| Name | Description |
|------|-------------|
| Product (ENT) | Product catalog item with variants, pricing, and inventory. |

Value Objects (gray left border):

| Name | Description |
|------|-------------|
| Money | Multi-currency safe numeric values. |
| Address | Strict format validated delivery destination. |
| OrderStatus | Status enum limiting invalid transitions. |

---

### Screen 3: Entity Behaviors (Product Entity)

File: designs/03-product-entity.png
Route: /domain-model/order/product
Breadcrumb: Domain Model > Order > Product

Shows the Product entity's behaviors, value objects, and a detail inspector panel.

Behaviors (blue/indigo left border):

| Name | Description | Stats |
|------|-------------|-------|
| updatePrice() | Adjusts the product price and notifies subscribers. | 1 Event · 1 Error |
| adjustStock() | Increases or decreases available inventory count. | 1 Event · 1 Error |
| activate() | Makes the product available for purchase. | 1 Event · 0 Errors |
| deactivate() | Removes the product from active catalog. | 1 Event · 0 Errors |

Hover tooltip on behavior cards shows a summary like:
updatePrice() emits: PriceUpdated | errors: InvalidPriceError

Value Objects (gray left border):

| Name | Description |
|------|-------------|
| ProductCategory | Hierarchical classification for catalog organization. |
| SKU | Stock keeping unit identifier with format validation. |

Inspector Panel (right side):

- Entity name: Product
- Type: Entity
- Fields: id (UUID), name (String), sku (String), price (Money), category (ProductCategory), stock (Integer), isActive (Boolean)

---

### Screen 4: Behavior Detail — Events & Errors

File: designs/04-behavior-events-errors.png
Route: /domain-model/order/order-entity/placeOrder
Breadcrumb: Domain Model > Order > Order Entity > placeOrder()

Events Emitted (orange left border):

| Name | Description |
|------|-------------|
| OrderPlaced | Published when a new order is successfully created and validated. Carries orderId, customerId, items, and totalAmount. |
| OrderConfirmed | Published after payment authorization succeeds. Triggers fulfillment workflow downstream. |

Errors Raised (red left border):

| Name | Description |
|------|-------------|
| InsufficientInventoryError | Raised when one or more line items exceed available stock. Returns the failing SKU and available quantity. |
| InvalidOrderError | Raised when order validation fails — missing required fields, negative quantities, or unsupported currency. |

Behavior Signature (dark code block):
placeOrder(customerId: UUID, items: OrderLineInput[], shippingAddress: Address): Order

Inspector Panel (right side):

- Name: placeOrder()
- Parameters: customerId (UUID), items (OrderLineInput[]), shippingAddress (Address)
- Return Type: Order

---

### Screen 5: Use Cases List

File: designs/05-use-cases-list.png
Route: /use-cases
Breadcrumb: Use Cases

Commands (purple #8B5CF6 left border, CMD badge):

| Name | Description | Touches |
|------|-------------|---------|
| Place Order | Creates a new order from cart items, validates inventory, and processes payment. | Order, Product, Payment |
| Ship Order | Initiates shipment for a confirmed order and assigns carrier. | Order, Shipment |
| Cancel Order | Cancels an active order and triggers refund if applicable. | Order, Payment |
| Update Product Price | Adjusts product pricing and notifies subscribers. | Product |

Queries (sky blue #0EA5E9 left border, QRY badge):

| Name | Description | Touches |
|------|-------------|---------|
| Get Order Details | Retrieves full order information with line items and status. | Order |
| List Products | Returns filtered product catalog with availability. | Product |
| Get Customer Orders | Fetches all orders for a specific customer. | Order, Customer |
| Check Inventory | Returns current stock levels for specified products. | Product |

---

### Screen 6: Use Case Detail (Place Order)

File: designs/06-use-case-detail.png
Route: /use-cases/place-order
Breadcrumb: Use Cases > Place Order

Command Input (dark code block):
PlaceOrderCommand {
customerId: UUID,
items: OrderLineInput[],
shippingAddress: Address,
paymentMethod: PaymentMethod
}

Aggregates & Entities Involved (yellow cards with link icons → navigate to Domain Model):

| Name | Type | Role |
|------|------|------|
| Order | AGG | Creates new Order aggregate root |
| Product | ENT | Validates stock availability |
| Payment | AGG | Processes payment authorization |

Events Emitted (orange left border):

| Name | Description |
|------|-------------|
| OrderPlaced | Published on successful order creation |
| PaymentAuthorized | Published when payment clears |

Errors Raised (red left border):

| Name | Description |
|------|-------------|
| InsufficientInventoryError | When stock is unavailable |
| InvalidOrderError | When validation fails |
| PaymentDeclinedError | When payment authorization fails |

Flow Diagram (horizontal):
Command → Order (validate) → Product (check stock) → Payment (authorize) → OrderPlaced Event

---

## Color System (Event Storming)

| Concept         | Color         | Hex     | Background Hex | Usage                                    |
| --------------- | ------------- | ------- | -------------- | ---------------------------------------- |
| Aggregate       | Yellow        | #EAB308 | #FFFBEB        | Left border accent on aggregate cards    |
| Entity          | Golden Yellow | #F59E0B | #FEF3C7        | Left border accent on entity cards       |
| Event           | Orange        | #F97316 | #FFF7ED        | Left border accent on event cards        |
| Error           | Red           | #EF4444 | #FEF2F2        | Left border accent on error cards        |
| Value Object    | Gray          | #6B7280 | #F3F4F6        | Left border accent on value object cards |
| Behavior/Method | Indigo        | #4F46E5 | #EEF2FF        | Left border accent on behavior cards     |
| Domain Service  | Green         | #16A34A | #F0FDF4        | Left border accent on service cards      |
| Repository      | Slate Gray    | #64748B | #F8FAFC        | Left border accent on repository cards   |
| Command         | Purple        | #8B5CF6 | #F5F3FF        | Left border on command use case cards    |
| Query           | Sky Blue      | #0EA5E9 | #F0F9FF        | Left border on query use case cards      |

Badge Colors:

- AGG badge: Yellow #EAB308 background
- ENT badge: Golden #F59E0B background
- CMD badge: Purple #8B5CF6 background
- QRY badge: Sky Blue #0EA5E9 background

---

## Layout Structure

### Global Layout

- Sidebar: 260px wide, dark #18181B background
- Main content: Remaining width, white #FFFFFF background
- Content padding: 32px

### Sidebar Navigation

- DDD Explorer logo + "Enterprise Architecture Tool"
- PROJECT section with dropdown (e.g., "eCommerce Core")
- Nav items (vertical list):
  - Domain Model
  - Event Storming
  - Schema Export
  - Explorer Settings
  - Use Cases (at bottom, separated)
- User avatar at the very bottom (name + role)

Active nav item: #27272A background, white text
Inactive nav item: transparent background, #A1A1AA text

### Card Pattern

All cards follow a consistent structure:

- White background with subtle shadow (0 1px 3px rgba(0,0,0,0.1))
- 6px colored left border (color depends on concept type)
- Rounded corners (8px)
- Padding: 16px
- Content: Name (bold) + optional badge, description (gray text), stats/tags row

### Breadcrumb

- Located at top of main content area
- Purple/indigo text for clickable segments
- > chevron separators
- Current segment in darker text

### Legend Bar

- Horizontal row below the header
- Small colored dots + labels for each concept type
- Light background with subtle border

### Inspector Panel (Screens 3 & 4)

- Right side panel, ~320px wide
- Shows selected item details: name, type badge, description, fields list
- Each field shows: name, type (colored link text)

---

## Typography

- Font family: Geist (sans-serif), Geist Mono (code blocks)
- Page title: 28px, weight 700
- Section headers: 12px, weight 600, uppercase, letter-spacing 0.5px, color #71717A
- Card title: 16px, weight 700, color #09090B
- Card description: 13px, weight 400, color #52525B
- Badge text: 11px, weight 600, uppercase
- Stats/tags: 11px, weight 500
- Code blocks: Geist Mono, 13px, line-height 1.6

---

## Navigation Flow

DOMAIN MODEL PATH:
Aggregates & Entities → Order Aggregate (behaviors, entities, value objects) → Product Entity (behaviors, value objects, inspector panel) → updatePrice() Events & Errors

USE CASES PATH:
Use Cases (all CMDs & QRYs) → Place Order detail (command input, aggregates, events, errors, flow) —— links back to —→ Domain Model screens

---

## Interaction Patterns

- Click on a block/card: Navigate to the next drill-down level
- Hover on a behavior card: Show tooltip with events/errors summary
- Click on aggregate/entity in Use Case detail: Navigate to corresponding Domain Model screen
- Breadcrumb segments: Clickable, navigate back up the hierarchy
- Sidebar nav items: Switch between Domain Model and Use Cases sections
