-- Create personal_events table for user-specific events
CREATE TABLE IF NOT EXISTS public.personal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME,
  event_name VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  is_all_day BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create event_notifications table for notification settings
CREATE TABLE IF NOT EXISTS public.event_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.personal_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('popup', 'email', 'sms')),
  notification_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, notification_type)
);

-- Create notification_preferences table for user notification settings
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_popup BOOLEAN DEFAULT true,
  enable_email BOOLEAN DEFAULT false,
  enable_sms BOOLEAN DEFAULT false,
  email_address VARCHAR(255),
  phone_number VARCHAR(20),
  default_reminder_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS on personal_events
ALTER TABLE public.personal_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own events
CREATE POLICY "Users can view their own events"
  ON public.personal_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own events
CREATE POLICY "Users can create their own events"
  ON public.personal_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own events
CREATE POLICY "Users can update their own events"
  ON public.personal_events
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own events
CREATE POLICY "Users can delete their own events"
  ON public.personal_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on event_notifications
ALTER TABLE public.event_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON public.event_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own notifications
CREATE POLICY "Users can create their own notifications"
  ON public.event_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own notifications
CREATE POLICY "Users can update their own notifications"
  ON public.event_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON public.event_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own preferences
CREATE POLICY "Users can view their own preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own preferences
CREATE POLICY "Users can create their own preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update their own preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_personal_events_user_id ON public.personal_events(user_id);
CREATE INDEX idx_personal_events_date ON public.personal_events(event_date);
CREATE INDEX idx_personal_events_user_date ON public.personal_events(user_id, event_date);
CREATE INDEX idx_event_notifications_user_id ON public.event_notifications(user_id);
CREATE INDEX idx_event_notifications_time ON public.event_notifications(notification_time);
CREATE INDEX idx_event_notifications_pending ON public.event_notifications(is_sent, notification_time);

-- Create function to update updated_at timestamp for personal_events
CREATE OR REPLACE FUNCTION update_personal_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for personal_events updated_at
CREATE TRIGGER update_personal_events_updated_at
  BEFORE UPDATE ON public.personal_events
  FOR EACH ROW
  EXECUTE FUNCTION update_personal_events_updated_at();

-- Create function to update updated_at timestamp for notification_preferences
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for notification_preferences updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Create function to automatically create notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to create default notification preferences for new users
CREATE TRIGGER create_default_notification_preferences_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Made with Bob