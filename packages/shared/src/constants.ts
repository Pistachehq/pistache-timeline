export const APP_NAME = 'Timeline';
export const APP_VERSION = '0.1.0';
export const APP_REPOSITORY_URL = 'https://github.com/Pistachehq/pistache-timeline';

/** File extension (without dot) used for saved Timeline projects. */
export const PROJECT_FILE_EXTENSION = 'timeline';
/** Identifier written into every project file to recognise the format. */
export const PROJECT_FORMAT_ID = 'timeline-project';
/** Upper bound for project files accepted by loaders, in bytes. */
export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'] as const;
export const MEDIA_EXTENSIONS: readonly string[] = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
