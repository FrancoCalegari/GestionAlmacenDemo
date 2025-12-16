-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE
create table if not exists users (
  id uuid default uuid_generate_v4() primary key,
  username text unique not null,
  password_hash text not null,
  role text check (role in ('admin', 'employee', 'warehouse')) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PRODUCTS TABLE
create table if not exists products (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  sku text unique not null,
  price numeric(10,2) not null check (price >= 0),
  stock integer not null default 0,
  min_stock integer default 5,
  category text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SALES TABLE
create table if not exists sales (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id) not null,
  total numeric(10,2) not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SALE ITEMS TABLE
create table if not exists sale_items (
  id uuid default uuid_generate_v4() primary key,
  sale_id uuid references sales(id) on delete cascade not null,
  product_id uuid references products(id) not null,
  quantity integer not null check (quantity > 0),
  price_at_sale numeric(10,2) not null, -- Store price at time of sale in case product price changes
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- STOCK LOGS (For tracking history)
create table if not exists stock_logs (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references products(id) not null,
  user_id uuid references users(id),
  change_amount integer not null,
  change_type text check (change_type in ('sale', 'restock', 'adjustment', 'return')) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SEED DATA (Initial Admin)
-- Password 'admin123' should be hashed in real app, but for initial setup we might need a way to insert it. 
-- For now, we will handle password hashing in the application and just insert a placeholder or let the user create the first admin via a script.
