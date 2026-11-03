import { Link } from 'react-router';
import { buttonClass } from '../components/Button';
import { LogoMark } from '../components/LogoMark';
import { useDocumentTitle } from '../lib/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <div className="bg-dots mx-auto mt-8 max-w-md rounded-card border border-border p-10 text-center">
      <span className="inline-block text-muted">
        <LogoMark size={48} />
      </span>
      <h1 className="font-display mt-4 text-xl font-extrabold">This checkpoint does not exist</h1>
      <p className="mt-2 text-sm text-muted">The page or game you are looking for is not here.</p>
      <Link to="/" className={`${buttonClass('secondary')} mt-6`}>
        Back to the catalog
      </Link>
    </div>
  );
}
