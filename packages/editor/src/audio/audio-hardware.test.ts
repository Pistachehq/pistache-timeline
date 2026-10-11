import { describe, expect, it } from 'vitest';
import { listsFromDevices, microphoneConstraints, parseAudioHardware } from './audio-hardware';

describe('parseAudioHardware', () => {
  it('falls back when storage is empty or broken', () => {
    expect(parseAudioHardware(null)).toEqual({ inputDeviceId: '', outputDeviceId: '' });
    expect(parseAudioHardware('nope')).toEqual({ inputDeviceId: '', outputDeviceId: '' });
    expect(parseAudioHardware('{"inputDeviceId":1}')).toEqual({ inputDeviceId: '', outputDeviceId: '' });
  });

  it('keeps saved device ids', () => {
    expect(parseAudioHardware('{"inputDeviceId":"mic","outputDeviceId":"spk"}')).toEqual({
      inputDeviceId: 'mic',
      outputDeviceId: 'spk',
    });
  });
});

describe('microphoneConstraints', () => {
  it('uses the system microphone until one is chosen', () => {
    expect(microphoneConstraints('')).toEqual({ echoCancellation: true, noiseSuppression: true });
  });

  it('pins recording to the chosen microphone', () => {
    expect(microphoneConstraints('mic-a')).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      deviceId: { exact: 'mic-a' },
    });
  });
});

describe('listsFromDevices', () => {
  it('hides duplicate defaults and names the system device', () => {
    const lists = listsFromDevices([
      { deviceId: 'default', kind: 'audiooutput', label: 'Default - Headphones' },
      { deviceId: 'communications', kind: 'audiooutput', label: 'Communications - Headphones' },
      { deviceId: 'spk-1', kind: 'audiooutput', label: 'Headphones' },
      { deviceId: 'mic-1', kind: 'audioinput', label: 'USB Mic' },
    ]);
    expect(lists.outputs).toEqual([{ deviceId: 'spk-1', label: 'Headphones' }]);
    expect(lists.inputs).toEqual([{ deviceId: 'mic-1', label: 'USB Mic' }]);
    expect(lists.outputDefaultLabel).toBe('System default (Headphones)');
    expect(lists.namesHidden).toBe(false);
    expect(lists.unavailable).toBe(false);
  });

  it('numbers unnamed devices and asks for permission when every name is blank', () => {
    const lists = listsFromDevices([
      { deviceId: '', kind: 'audioinput', label: '' },
      { deviceId: 'mic-1', kind: 'audioinput', label: '' },
      { deviceId: 'spk-1', kind: 'audiooutput', label: '' },
    ]);
    expect(lists.inputs).toEqual([{ deviceId: 'mic-1', label: 'Microphone 1' }]);
    expect(lists.outputs).toEqual([{ deviceId: 'spk-1', label: 'Speaker 1' }]);
    expect(lists.namesHidden).toBe(true);
  });
});
