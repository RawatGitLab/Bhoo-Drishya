export interface Photo {
  id: string;
  filename: string;
  length: number;
  contentType: string;
  uploadDate: string;
  metadata: {
    title: string;
    description: string;
    lat: number;
    lng: number;
    uploadedAt: string;
  };
}

export interface BaseMapLayer {
  id: string;
  name: string;
  url: string;
  attribution: string;
  description: string;
  category: "standard" | "satellite" | "dark" | "light" | "terrain";
}

export interface User {
  id: string;
  username: string;
  email: string;
  isAdmin?: boolean;
}

