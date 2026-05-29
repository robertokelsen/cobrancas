// app/page.tsx — raiz redireciona para o dashboard (middleware cuida do login).
import { redirect } from 'next/navigation';
export default function Home() { redirect('/dashboard'); }
