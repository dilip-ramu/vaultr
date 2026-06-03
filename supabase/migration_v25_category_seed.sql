-- Migration v25: Seed default expense + income categories for all existing users.
-- Uses WHERE NOT EXISTS so it is safe to re-run; skips any category already present.

WITH cats(name, type, icon, color) AS (VALUES
  -- ── Expense ──────────────────────────────────────────────────────────────
  ('Bank Charges / Fees',                    'expense', '🏦', '#6366F1'),
  ('Bank Transfer',                          'expense', '💸', '#6366F1'),
  ('Business Travel',                        'expense', '✈️', '#3B82F6'),
  ('Business Utilities / Rent',              'expense', '🏢', '#8B5CF6'),
  ('Car Loan EMI',                           'expense', '🚗', '#F59E0B'),
  ('Childcare / Babysitting',                'expense', '👶', '#EC4899'),
  ('Chit',                                   'expense', '🐖', '#10B981'),
  ('Cleaning Supplies',                      'expense', '🧹', '#14B8A6'),
  ('Clothing & Footwear',                    'expense', '👕', '#8B5CF6'),
  ('Coffee / Snacks / Small Eats',           'expense', '☕', '#92400E'),
  ('Courier',                                'expense', '📦', '#F59E0B'),
  ('Credit Card Bills',                      'expense', '💳', '#EF4444'),
  ('Doctor Visits',                          'expense', '👨‍⚕️', '#EF4444'),
  ('Domestic Help / Maid',                   'expense', '🧺', '#14B8A6'),
  ('Electricity Bill',                       'expense', '⚡', '#F59E0B'),
  ('Electronics',                            'expense', '📱', '#6366F1'),
  ('Emergency Medical Expense',              'expense', '🚑', '#EF4444'),
  ('Family Outings / Entertainment',         'expense', '🎡', '#EC4899'),
  ('Fuel / Petrol / Diesel',                 'expense', '⛽', '#F59E0B'),
  ('Gas / LPG / Cooking Fuel',               'expense', '🔥', '#F97316'),
  ('Gifts & Celebrations',                   'expense', '🎁', '#EC4899'),
  ('Groceries & Provisions',                 'expense', '🛒', '#10B981'),
  ('Gym / Fitness / Health / Wellbeing',     'expense', '🏋️', '#EF4444'),
  ('Health Check-ups',                       'expense', '🏥', '#EF4444'),
  ('Health Insurance',                       'expense', '🛡️', '#10B981'),
  ('Holiday',                                'expense', '🏖️', '#14B8A6'),
  ('Home Loan EMI / Rent',                   'expense', '🏠', '#8B5CF6'),
  ('Hotel & Accommodation',                  'expense', '🏨', '#3B82F6'),
  ('House Maintenance & Repairs',            'expense', '🏗️', '#F59E0B'),
  ('Insurance Premiums',                     'expense', '📋', '#6366F1'),
  ('Interest Payments',                      'expense', '📊', '#EF4444'),
  ('Internet / Wi-Fi',                       'expense', '📶', '#3B82F6'),
  ('Jewellery',                              'expense', '💍', '#F59E0B'),
  ('License Samples',                        'expense', '🏷️', '#F59E0B'),
  ('Loan Repayments',                        'expense', '💰', '#EF4444'),
  ('Loaned',                                 'expense', '🤝', '#6366F1'),
  ('Lullabee',                               'expense', '🐝', '#F59E0B'),
  ('Marketing & Advertising',                'expense', '📣', '#3B82F6'),
  ('Medicines',                              'expense', '💊', '#EF4444'),
  ('Office Supplies',                        'expense', '📎', '#6366F1'),
  ('Old Outstanding',                        'expense', '📅', '#9CA3AF'),
  ('Other',                                  'expense', '💰', '#9CA3AF'),
  ('Parking / Tolls',                        'expense', '🅿️', '#6366F1'),
  ('Personal Care (Salon, Grooming, Spa)',   'expense', '💅', '#EC4899'),
  ('Pocket Money / Allowances',              'expense', '👛', '#14B8A6'),
  ('Property Tax',                           'expense', '🏛️', '#8B5CF6'),
  ('Public Transport / Cab Rides',           'expense', '🚌', '#3B82F6'),
  ('Real Estate',                            'expense', '🏡', '#8B5CF6'),
  ('Restaurants & Takeaways',               'expense', '🍽️', '#F97316'),
  ('School Fees',                            'expense', '🎒', '#3B82F6'),
  ('Sightseeing / Activities',               'expense', '🎭', '#EC4899'),
  ('Software / Subscriptions (Google, Monday, etc.)', 'expense', '💻', '#6366F1'),
  ('Special Occasions / Parties',            'expense', '🎉', '#EC4899'),
  ('Staff Salaries / Payments',              'expense', '👷', '#3B82F6'),
  ('Subscriptions (Netflix, Spotify, etc.)', 'expense', '📺', '#EF4444'),
  ('Testing',                                'expense', '🧪', '#10B981'),
  ('Toys',                                   'expense', '🧸', '#EC4899'),
  ('Travel Shopping / Souvenirs',            'expense', '🛍️', '#8B5CF6'),
  ('Tuition / Classes / Coaching',           'expense', '📚', '#3B82F6'),
  ('Unyra',                                  'expense', '✨', '#8B5CF6'),
  ('Vacation / Trips',                       'expense', '🌴', '#14B8A6'),
  ('Vehicle Insurance',                      'expense', '🚘', '#10B981'),
  ('Vehicle Loan EMI',                       'expense', '🚙', '#EF4444'),
  ('Vehicle Service & Maintenance',          'expense', '🔧', '#F59E0B'),
  ('Water Bill',                             'expense', '💧', '#3B82F6'),
  -- ── Income ───────────────────────────────────────────────────────────────
  ('Business Income',                        'income',  '💼', '#10B981'),
  ('Other',                                  'income',  '💰', '#9CA3AF'),
  ('Stock Market',                           'income',  '📈', '#10B981')
)
INSERT INTO categories (user_id, name, type, icon, color)
SELECT u.id, c.name, c.type, c.icon, c.color
FROM auth.users u
CROSS JOIN cats c
WHERE NOT EXISTS (
  SELECT 1 FROM categories ex
  WHERE ex.user_id = u.id
    AND ex.name = c.name
    AND ex.type = c.type
);
