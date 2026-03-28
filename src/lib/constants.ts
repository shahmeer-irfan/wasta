import { LandmarkData } from '@/types';

export const KARACHI_LANDMARKS: LandmarkData[] = [
  { name: "Moti Mahal", lat: 24.9204, lng: 67.0932, zone: "Gulshan" },
  { name: "Lucky One Mall", lat: 24.9312, lng: 67.0901, zone: "FB Area" },
  { name: "Do Darya", lat: 24.7981, lng: 67.0645, zone: "DHA" },
  { name: "Nipa Chowrangi", lat: 24.9175, lng: 67.0972, zone: "Gulshan" },
  { name: "Nursery", lat: 24.8615, lng: 67.0542, zone: "PECHS" },
  { name: "Clifton Bridge", lat: 24.8206, lng: 67.0305, zone: "Clifton" },
  { name: "Tariq Road", lat: 24.8690, lng: 67.0649, zone: "PECHS" },
  { name: "Saddar", lat: 24.8607, lng: 67.0100, zone: "Saddar" },
  { name: "Korangi Crossing", lat: 24.8320, lng: 67.1270, zone: "Korangi" },
  { name: "North Nazimabad", lat: 24.9420, lng: 67.0350, zone: "North Nazimabad" },
];

export const KARACHI_CENTER = { lat: 24.8607, lng: 67.0011 };

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Moderate',
  3: 'High',
  4: 'Critical',
  5: 'Life-Threatening',
};

export const SEVERITY_COLORS: Record<number, string> = {
  1: 'text-green-400',
  2: 'text-yellow-400',
  3: 'text-orange-400',
  4: 'text-orange-500',
  5: 'text-orange-500',
};

export const STATUS_STEPS = [
  'Request Sent',
  'Broadcasting',
  'Accepted',
  'En Route',
  'On Scene',
  'Resolved',
] as const;
