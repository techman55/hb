export type LocalPhoto = {
  key: string;
  previewUrl: string;
  source: "camera" | "upload";
  status: "uploading" | "uploaded" | "error";
  progress: number;
  photoId?: string;
  error?: string;
};

export type Details = {
  title: string;
  description: string;
  category: string;
  condition: "new" | "like_new" | "good" | "fair";
  tags: string[];
  included: string[];
};

export const EMPTY_DETAILS: Details = {
  title: "",
  description: "",
  category: "",
  condition: "good",
  tags: [],
  included: [],
};

export function detailsValid(d: Details) {
  return d.title.trim().length >= 3 && d.title.trim().length <= 60 && !!d.category && d.description.length <= 600;
}
