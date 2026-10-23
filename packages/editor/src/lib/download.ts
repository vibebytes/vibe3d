export function downloadBase64(base64: string, mime: string, name: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadUrl(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
