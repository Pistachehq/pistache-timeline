export function premiereSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function videoTransitionLibraryId(relativePath: string): string {
  return `video-transitions/${premiereSlug(relativePath)}`;
}
