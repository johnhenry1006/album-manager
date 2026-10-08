import { Link } from 'react-router';

import { PageContainer } from '@/components/layout/PageContainer.jsx';

export function NotFoundPage() {
  return (
    <PageContainer title="Page not found" description="This page does not exist.">
      <Link to="/dashboard">Go to dashboard</Link>
    </PageContainer>
  );
}
