'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';

interface DashboardStats {
    totalQuotes: number;
    pendingQuotes: number;
    confirmedQuotes: number;
    totalReservations: number;
    completedReservations: number;
}
