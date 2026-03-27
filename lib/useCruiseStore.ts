import { create } from 'zustand';


interface CruiseState {
  schedule_code: string;
  cruise_code: string;
  setScheduleCode: (code: string) => void;
  setCruiseCode: (code: string) => void;
}

export const useCruiseStore = create<CruiseState>((set: (fn: Partial<CruiseState> | ((state: CruiseState) => Partial<CruiseState>)) => void) => ({
  schedule_code: '',
  cruise_code: '',
  setScheduleCode: (code: string) => set({ schedule_code: code }),
  setCruiseCode: (code: string) => set({ cruise_code: code }),
}));
