// Google Drive Upload Utility via Apps Script
// Sends file as base64 to the Apps Script which saves it to Google Drive
// and returns a shareable link

const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || '';

export interface DriveUploadResult {
  success: boolean;
  url?: string;
  fileId?: string;
  error?: string;
}

/**
 * Converts a File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:mime;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a file to Google Drive via Apps Script
 * @param file - The file to upload
 * @param folder - Optional folder path in Drive (e.g., "fms/entry-123/step-1")
 */
export async function uploadToDrive(file: File, folder?: string): Promise<DriveUploadResult> {
  if (!SCRIPT_URL) {
    console.error('Apps Script URL not configured. Set NEXT_PUBLIC_APPS_SCRIPT_URL in .env.local');
    return { success: false, error: 'Apps Script URL not configured' };
  }

  try {
    const base64Data = await fileToBase64(file);

    const payload = {
      action: 'uploadToDrive',
      fileName: file.name,
      mimeType: file.type,
      base64Data: base64Data,
      folder: folder || 'FMS_Attachments',
    };

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        url: data.url,
        fileId: data.fileId,
      };
    } else {
      return { success: false, error: data.message || 'Upload failed' };
    }
  } catch (error) {
    console.error('Drive upload error:', error);
    return { success: false, error: 'Network error during upload' };
  }
}

/**
 * Upload multiple files to Google Drive
 */
export async function uploadMultipleToDrive(
  files: File[],
  folder?: string
): Promise<DriveUploadResult[]> {
  const results = await Promise.all(
    files.map((file) => uploadToDrive(file, folder))
  );
  return results;
}