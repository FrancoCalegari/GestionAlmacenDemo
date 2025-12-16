-- PAYMENT METHODS TABLE
create table if not exists payment_methods (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  surcharge_percent numeric(5,2) default 0 check (surcharge_percent >= 0),
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert default payment methods
insert into payment_methods (name, surcharge_percent) values ('Efectivo', 0);
insert into payment_methods (name, surcharge_percent) values ('Tarjeta de Débito', 0);
insert into payment_methods (name, surcharge_percent) values ('Tarjeta de Crédito', 5.0);
insert into payment_methods (name, surcharge_percent) values ('Mercado Pago', 0);

-- SALE PAYMENTS TABLE (For split payments)
create table if not exists sale_payments (
  id uuid default uuid_generate_v4() primary key,
  sale_id uuid references sales(id) on delete cascade not null,
  payment_method_id uuid references payment_methods(id) not null,
  amount numeric(10,2) not null check (amount > 0),
  surcharge_amount numeric(10,2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add total columns to sales if they don't exist (or just use total for base and keep it simple)
-- We will modify sales table to track base total and surcharge total?
-- For now, let's just stick to tracking the payments in sale_payments. The sum of sale_payments might differ from sales.total if there are surcharges.
-- Let's update sales table to be clear:
alter table sales add column if not exists total_base numeric(10,2) default 0;
alter table sales add column if not exists total_surcharge numeric(10,2) default 0; 
-- Rename original total to 'final_total' for clarity? No, let's keep 'total' as the final amount users pay (including surcharge) and 'total_base' as the price of products.
-- sales.total will be the SUM of all payments (including surcharges).
