import { render } from 'preact';
import { App } from './app';
import { keepFocusAlive } from './nav/spatial';
import { registerRemoteKeys } from './platform/tizen';
import { refreshDrives } from './sources';
import './styles.css';

registerRemoteKeys();
// Detect USB drives up front so source lists are complete when first shown.
void refreshDrives();
const stage = document.getElementById('stage')!;
render(<App />, stage);
keepFocusAlive(stage);
