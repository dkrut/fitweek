import { PageHeader } from '../components/Layout';
import { PlanEditor } from '../components/PlanEditor';

export default function PlanPage() {
  return (
    <>
      <PageHeader
        title="План недели"
        subtitle="Что есть и чем заниматься в каждый день недели"
      />
      <PlanEditor />
    </>
  );
}
