import { LoginPanel } from './components/LoginPanel.js';
import { Overview } from './pages/Overview.js';
import { Trades } from './pages/Trades.js';
import { Strategy } from './pages/Strategy.js';
import { Settings } from './pages/Settings.js';

export function App() {
  return <main className="shell"><aside><h1>Obsidra</h1><p>Paper-first trading dashboard</p><LoginPanel /></aside><section><Overview /><Trades /><Strategy /><Settings /></section></main>;
}
