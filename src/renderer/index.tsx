import { render } from 'solid-js/web';

import { App } from './app/App';
import './app/styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element was not found');
}

render(() => <App />, root);
