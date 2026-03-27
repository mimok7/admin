// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkhookaflhibrcafmlxn.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4MzI4MzAsImV4cCI6MjA2NzQwODgzMH0.gyl-bSYT3VHSB-9T8yxMHrAIHaLg2KdbA2qCq6pMtWI'; // 🔑 anon public 키 필요

const supabase = createClient(supabaseUrl, supabaseKey);
export default supabase;
