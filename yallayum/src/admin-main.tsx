import { render } from 'preact';
import './app/styles.css';
import './admin/admin.css';
import { Admin } from './admin/Admin';

render(<Admin />, document.getElementById('app')!);
