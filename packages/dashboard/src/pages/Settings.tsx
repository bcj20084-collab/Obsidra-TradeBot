import { KillSwitch } from '../components/KillSwitch.js';
export function Settings() { return <section className="panel"><h2>Control</h2><KillSwitch /><p>Auth uses httpOnly cookies from the API. No localStorage auth.</p></section>; }
