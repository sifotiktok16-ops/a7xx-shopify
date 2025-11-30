# E-Commerce Dashboard

A comprehensive e-commerce dashboard built with React, TypeScript, and Supabase that provides real-time analytics and management capabilities for Shopify stores.

## Features

### 🔐 Authentication
- **Gmail OAuth Integration** - Sign up/login with Google account
- **Email/Password Authentication** - Traditional signup and login
- **Secure Session Management** - JWT-based authentication with Supabase

### 📊 Dashboard Analytics
- **Real-time Metrics** - Total sales, orders, customers, and conversion rates
- **Sales Trends** - Interactive line charts showing sales over time
- **Order Status Distribution** - Bar charts for order fulfillment status
- **Top Products** - Best-selling products with inventory levels
- **Revenue Summary** - Period-over-period growth analysis
- **Daily Order Tracking** - Average orders per day

### 🛒 Shopify Integration
- **Secure API Connection** - Connect your Shopify store with encrypted credentials
- **Automatic Data Sync** - Orders and products sync automatically
- **Real-time Updates** - Live data fetching from Shopify API
- **Multi-store Support** - Connect multiple Shopify stores (per user basis)

### 🚚 Delivery Services
- **Multiple Carriers** - Support for FedEx, UPS, DHL, and more
- **API Integration** - Connect delivery service APIs for automated shipping
- **Shipping Automation** - Automated label generation and tracking

### 🔒 Security & Privacy
- **User Data Isolation** - Each user's data is completely separate and secure
- **Row Level Security** - Database-level security policies
- **Encrypted API Keys** - All API credentials are encrypted in storage
- **Secure Architecture** - Industry-standard security practices

## Technology Stack

### Frontend
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server
- **TailwindCSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icon library
- **Recharts** - Interactive chart library
- **React Router** - Client-side routing
- **Zustand** - Lightweight state management

### Backend & Database
- **Supabase** - Backend-as-a-Service with PostgreSQL
- **PostgreSQL** - Robust relational database
- **Row Level Security (RLS)** - Database-level security
- **Real-time Subscriptions** - Live data updates

### APIs & Integrations
- **Shopify Admin API** - Store data synchronization
- **Google OAuth** - Authentication provider
- **Delivery Service APIs** - Shipping integration

## Project Structure

```
src/
├── components/          # Reusable UI components
│   └── DashboardLayout.tsx
├── pages/              # Page components
│   ├── Dashboard.tsx   # Main analytics dashboard
│   ├── Login.tsx       # Login page
│   ├── Signup.tsx      # Signup page
│   ├── Setup.tsx       # Shopify connection setup
│   ├── Delivery.tsx    # Delivery service setup
│   └── Settings.tsx    # User settings
├── services/           # API and business logic
│   ├── api.ts          # General API service
│   └── shopify.ts      # Shopify integration
├── stores/             # State management
│   └── authStore.ts    # Authentication state
├── lib/                # Utilities and configurations
│   └── supabase.ts     # Supabase client
└── hooks/              # Custom React hooks
```

## Database Schema

### Tables
- **shopify_connections** - User's Shopify store connections
- **orders** - Synchronized order data from Shopify
- **products** - Product catalog from Shopify
- **delivery_connections** - Delivery service integrations
- **api_keys** - User API key management

### Security
- All tables have Row Level Security (RLS) enabled
- Users can only access their own data
- API credentials are encrypted
- JWT tokens for secure authentication

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Supabase account
- Shopify store (for testing)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd e-commerce-dashboard
```

2. **Install dependencies**
```bash
npm install
# or
pnpm install
```

3. **Environment Setup**
```bash
cp .env.example .env
```

Configure your environment variables:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Database Setup**
Apply the database migrations in your Supabase project:
- Run the SQL files in `supabase/migrations/` in order
- Enable Google OAuth in Supabase Auth settings
- Configure RLS policies

5. **Start Development Server**
```bash
npm run dev
# or
pnpm dev
```

The application will be available at `http://localhost:5173`

## Usage

### 1. Create Account
- Visit the application
- Click "Create account" or use Google OAuth
- Complete the registration process

### 2. Connect Shopify Store
- Navigate to Setup page
- Enter your Shopify store URL (format: `yourstore.myshopify.com`)
- Provide API credentials from Shopify Admin
- Test connection and save

### 3. View Dashboard
- Access comprehensive analytics
- Monitor sales trends
- Track order status
- Analyze product performance

### 4. Setup Delivery (Optional)
- Navigate to Delivery page
- Select your preferred delivery service
- Enter API credentials
- Enable automated shipping

## API Integration

### Shopify Setup
1. Log in to Shopify Admin
2. Go to Settings → Apps and sales channels
3. Click "Develop apps"
4. Create new app with read permissions for:
   - Orders
   - Products
   - Customers
5. Generate API credentials

### Delivery Services
Each delivery service requires:
- API Key
- API Secret/Password
- Account verification

## Deployment

### Production Build
```bash
npm run build
```

### Environment Variables for Production
- Configure all environment variables
- Set up custom domain
- Enable SSL certificate
- Configure CORS settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Check the documentation
- Review the database schema
- Test API connections
- Verify environment configuration
