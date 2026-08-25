-- Create company_holidays table
CREATE TABLE IF NOT EXISTS public.company_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  holiday_name VARCHAR(255) NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(holiday_date)
);

-- Enable RLS
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read holidays
CREATE POLICY "Anyone can view company holidays"
  ON public.company_holidays
  FOR SELECT
  USING (true);

-- Policy: Only admins can insert holidays
CREATE POLICY "Only admins can create company holidays"
  ON public.company_holidays
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_hub_memberships
      WHERE user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
    )
  );

-- Policy: Only admins can update holidays
CREATE POLICY "Only admins can update company holidays"
  ON public.company_holidays
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_hub_memberships
      WHERE user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
    )
  );

-- Policy: Only admins can delete holidays
CREATE POLICY "Only admins can delete company holidays"
  ON public.company_holidays
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_hub_memberships
      WHERE user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
    )
  );

-- Create index for faster date queries
CREATE INDEX idx_company_holidays_date ON public.company_holidays(holiday_date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_holidays_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_company_holidays_updated_at
  BEFORE UPDATE ON public.company_holidays
  FOR EACH ROW
  EXECUTE FUNCTION update_company_holidays_updated_at();

-- Insert initial bi-weekly Friday holidays starting from June 12, 2026
-- Generate holidays for the next 2 years (52 holidays)
INSERT INTO public.company_holidays (holiday_date, holiday_name, description, is_recurring)
SELECT 
  date_val,
  '사내 휴일 (격주 금요일)',
  '2주 단위 금요일 사내 휴일',
  true
FROM (
  SELECT 
    DATE '2026-06-12' + (n * INTERVAL '14 days') as date_val
  FROM generate_series(0, 51) as n
) dates
WHERE date_val >= DATE '2026-06-12'
ON CONFLICT (holiday_date) DO NOTHING;

-- Made with Bob
