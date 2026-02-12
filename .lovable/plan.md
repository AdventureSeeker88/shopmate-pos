

# Mobile Shop Management System

A comprehensive shop management system for mobile phone retailers, built with React + Supabase backend.

## Phase 1: Foundation & Admin Setup
- **Admin Authentication**: Login page with email/password authentication
- **Admin Dashboard**: Overview page with key metrics (today's sales, total stock, pending payments, profit)
- **Settings Page**: Configure shop name, currency, and basic preferences (stored in database)
- **Sidebar Navigation**: Clean navigation to all modules

## Phase 2: Product & Category Management
- **Category Management**: Add/edit/delete categories (Mobiles, Covers, Accessories, etc.)
- **Product Management**: Add products with name, category, cost price, sale price, stock quantity, IMEI (for mobiles)
- **Product List**: Searchable, filterable product table with stock levels
- **Price List Print**: Printable price list view grouped by category

## Phase 3: Supplier & Purchase Management
- **Supplier Management**: Add/view suppliers with contact info and payment terms
- **Purchase Entry**: Record purchases from suppliers with product details, quantities, prices
- **Purchase Returns**: Handle returns to suppliers with stock adjustment
- **Supplier Ledger**: Track payable amounts per supplier

## Phase 4: Customer Management
- **Customer Records**: Add/view customers with contact details
- **Customer Ledger**: Track receivable/payable amounts per customer
- **Customer Purchase History**: View all transactions for a customer

## Phase 5: POS (Point of Sale)
- **POS Screen**: Fast billing interface — search products, add to cart, apply discounts
- **Invoice Generation**: Generate and print invoices with shop details
- **Multiple Payment Methods**: Cash, bank transfer, wallet payment support
- **Sale Return**: Process returns with stock and payment adjustments

## Phase 6: Financial Management
- **Payment Management**: Record incoming/outgoing payments (cash, bank, wallet)
- **Expense Management**: Track shop expenses (rent, salary, electricity, etc.) with categories
- **Invoice History**: View all past invoices with search and filters
- **Profit & Loss Reports**: Auto-calculated profit/loss from sales, purchases, and expenses

## Phase 7: Ledger & Day Book
- **Ledger System**: Individual ledgers for customers, suppliers, bank, and cash accounts showing opening balance, debits, credits, and closing balance
- **Day Book**: Daily transaction summary showing all sales, purchases, payments, and expenses for any selected date

## Design Approach
- Clean, professional UI with sidebar navigation
- Mobile-responsive for tablet use at shop counter
- Dark/light mode support
- Print-friendly invoice and price list layouts

