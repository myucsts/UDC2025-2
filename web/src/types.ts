export type DailyWindow = {
  dayLabel: string;
  open?: string | null;
  close?: string | null;
};

export type CoolingShelter = {
  id: string;
  municipalityCode?: string;
  municipalityName: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  openings: DailyWindow[];
  specialNotes?: string;
  capacity?: number | null;
  manager?: string;
  email?: string;
  phone?: string;
  url?: string;
  designationDate?: string;
  facilityTypeCategory?: string;
  facilityOwnership?: string;
};

export type GeoPoint = {
  latitude: number;
  longitude: number;
};
