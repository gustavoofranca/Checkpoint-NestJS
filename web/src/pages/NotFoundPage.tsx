import { Link } from 'react-router';
import { buttonClass } from '../components/Button';
import { useDocumentTitle } from '../lib/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <div className="mx-auto mt-12 max-w-md text-center">
      <h1 className="text-xl">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The page or game you are looking for does not exist.
      </p>
      <Link to="/" className={`${buttonClass('secondary')} mt-6`}>
        Back to the catalog
      </Link>
    </div>
  );
}
