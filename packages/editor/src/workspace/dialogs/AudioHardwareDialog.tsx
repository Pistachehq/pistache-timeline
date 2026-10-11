import { Button, Dialog, Select } from '@timeline/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  canSelectOutputDevice,
  getAudioHardware,
  loadAudioDeviceLists,
  revealAudioDeviceNames,
  setInputDevice,
  setOutputDevice,
  subscribeAudioHardware,
  type AudioDeviceLists,
  type AudioHardwarePrefs,
  type ListedAudioDevice,
} from '../../audio/audio-hardware';

function deviceOptions(devices: readonly ListedAudioDevice[], selected: string, systemLabel: string) {
  const options = [
    { value: '', label: systemLabel },
    ...devices.map((device) => ({ value: device.deviceId, label: device.label })),
  ];
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({ value: selected, label: 'Unavailable device' });
  }
  return options;
}

/** Chooses the playback output and the microphone used for voice over. */
export function AudioHardwareDialog({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<AudioHardwarePrefs>(getAudioHardware);
  const [lists, setLists] = useState<AudioDeviceLists | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const outputSupported = canSelectOutputDevice();

  const refresh = useCallback(async () => {
    try {
      setLists(await loadAudioDeviceLists());
    } catch {
      setNote('Could not list audio devices.');
    }
  }, []);

  useEffect(() => subscribeAudioHardware(setPrefs), []);

  useEffect(() => {
    void refresh();
    const media = navigator.mediaDevices;
    if (!media) return;
    const onChange = () => {
      void refresh();
    };
    media.addEventListener('devicechange', onChange);
    return () => media.removeEventListener('devicechange', onChange);
  }, [refresh]);

  const onOutput = async (outputDeviceId: string) => {
    setNote(null);
    const error = await setOutputDevice(outputDeviceId);
    setPrefs(getAudioHardware());
    if (error) setNote(error);
  };

  const onReveal = async () => {
    setRevealing(true);
    setNote(null);
    try {
      await revealAudioDeviceNames();
      await refresh();
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setNote(denied ? 'Microphone access was denied, so device names stay hidden.' : 'Could not open the microphone.');
    } finally {
      setRevealing(false);
    }
  };

  const inputs = lists?.inputs ?? [];
  const outputs = lists?.outputs ?? [];

  return (
    <Dialog
      open
      title="Audio Hardware"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <p className="mb-3 text-xs text-fg-muted">
        Playback, including the program monitor and source preview, uses the output device. Voice over records from the
        input device.
      </p>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle">Output device</span>
          <Select
            label="Output device"
            className="w-full"
            value={prefs.outputDeviceId}
            options={deviceOptions(outputs, prefs.outputDeviceId, lists?.outputDefaultLabel ?? 'System default')}
            disabled={!outputSupported || lists === null}
            onValueChange={(value) => {
              void onOutput(value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-fg-subtle">Input device</span>
          <Select
            label="Input device"
            className="w-full"
            value={prefs.inputDeviceId}
            options={deviceOptions(inputs, prefs.inputDeviceId, lists?.inputDefaultLabel ?? 'System default')}
            disabled={lists === null || lists.unavailable}
            onValueChange={(value) => {
              setNote(null);
              setInputDevice(value);
            }}
          />
        </label>
      </div>
      {lists?.unavailable ? <p className="mt-3 text-xs">This browser cannot list audio devices.</p> : null}
      {!outputSupported ? <p className="mt-3 text-xs">This browser always plays through the system default output.</p> : null}
      {lists?.namesHidden ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs">Allow the microphone to show device names.</p>
          <Button size="sm" disabled={revealing} onClick={() => void onReveal()}>
            {revealing ? 'Waiting…' : 'Show names'}
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button size="sm" onClick={() => void refresh()}>
            Refresh devices
          </Button>
        </div>
      )}
      {note ? <p className="mt-3 text-xs text-danger">{note}</p> : null}
    </Dialog>
  );
}
