// Cloudinary Upload Utility
// Uses unsigned upload preset for client-side uploads
// You need to create an unsigned upload preset in your Cloudinary dashboard:
// Settings > Upload > Upload presets > Add upload preset > Signing Mode: Unsigned

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

export async function uploadToCloudinary(file: File, folder?: string): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.error('Cloudinary configuration missing. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.local');
    return { success: false, error: 'Cloudinary not configured' };
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    if (folder) {
      formData.append('folder', folder);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error?.message || 'Upload failed' };
    }

    const data = await response.json();
    return {
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return { success: false, error: 'Network error during upload' };
  }
}

export async function uploadMultipleToCloudinary(
  files: File[],
  folder?: string
): Promise<CloudinaryUploadResult[]> {
  const results = await Promise.all(
    files.map((file) => uploadToCloudinary(file, folder))
  );
  return results;
}