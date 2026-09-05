import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Supplement, SupplementInput } from '@shared/index';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Sheet,
  Spinner,
  Textarea,
  cx,
  useToast,
} from '../components/ui';
import { useSupplements } from '../lib/queries';

const emptySupplement: SupplementInput = {
  name: '',
  dose: '',
  notes: '',
  active: true,
};

export default function SupplementsPage() {
  const supplements = useSupplements();
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null);
  const toast = useToast();

  const list = supplements.list.data ?? [];
  const empty = supplements.list.data !== undefined && list.length === 0;

  return (
    <>
      {/* While the catalogue is empty the way in is the button in the empty
          state, as in the other two catalogues: one screen, one button. */}
      <PageHeader
        title="Добавки"
        subtitle="Что принимать; по каким дням — в плане недели"
        action={
          empty ? undefined : (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} />
              Добавка
            </Button>
          )
        }
      />

      {supplements.list.isPending ? <Spinner /> : null}
      {supplements.list.isError ? (
        <ErrorState
          error={supplements.list.error}
          onRetry={() => void supplements.list.refetch()}
        />
      ) : null}

      {empty ? (
        <EmptyState
          title="Добавок пока нет"
          description="Добавьте креатин, протеин, витамины — потом разложите их по дням в плане недели."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} />
              Добавить
            </Button>
          }
        />
      ) : null}

      <ul className="flex flex-col gap-2">
        {list.map((supplement) => (
          <li key={supplement.id}>
            <Card padded={false}>
              <div className="flex items-center gap-3 p-3.5">
                <Checkbox
                  checked={supplement.active}
                  label={`Использовать ${supplement.name}`}
                  onChange={(active) =>
                    supplements.update.mutate({ id: supplement.id, body: { active } })
                  }
                />

                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      'truncate text-sm font-medium',
                      !supplement.active && 'text-muted line-through decoration-1',
                    )}
                  >
                    {supplement.name}
                    {supplement.dose ? (
                      <span className="font-normal text-muted"> · {supplement.dose}</span>
                    ) : null}
                  </p>
                  {supplement.notes ? (
                    <p className="mt-0.5 truncate text-[12px] text-muted">{supplement.notes}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-0.5">
                  <IconButton label="Изменить" onClick={() => setEditing(supplement)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label="Удалить"
                    onClick={async () => {
                      try {
                        await supplements.remove.mutateAsync(supplement.id);
                        toast('Добавка удалена');
                      } catch (error) {
                        toast(error instanceof Error ? error.message : 'Ошибка', 'error');
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {list.length > 0 ? (
        <p className="mt-4 text-[12px] text-muted">
          Снятая галочка убирает добавку из новых дней, но история приёмов остаётся.
        </p>
      ) : null}

      {editing ? (
        <SupplementSheet
          supplement={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function SupplementSheet({
  supplement,
  onClose,
}: {
  supplement: Supplement | null;
  onClose: () => void;
}) {
  const supplements = useSupplements();
  const toast = useToast();
  const [form, setForm] = useState<SupplementInput>(() =>
    supplement
      ? {
          name: supplement.name,
          dose: supplement.dose,
          notes: supplement.notes,
          active: supplement.active,
        }
      : emptySupplement,
  );

  const submit = async () => {
    if (!form.name.trim()) {
      toast('Укажите название', 'error');
      return;
    }
    try {
      if (supplement) {
        await supplements.update.mutateAsync({ id: supplement.id, body: form });
      } else {
        await supplements.create.mutateAsync(form);
      }
      toast('Сохранено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={supplement ? 'Изменить добавку' : 'Новая добавка'}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            loading={supplements.create.isPending || supplements.update.isPending}
            onClick={() => void submit()}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Название">
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Креатин моногидрат"
          />
        </Field>

        <Field label="Дозировка">
          <Input
            value={form.dose}
            onChange={(event) => setForm({ ...form, dose: event.target.value })}
            placeholder="5 г"
          />
        </Field>

        <Field label="Заметка" hint="Когда и с чем принимать">
          <Textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            className="min-h-20"
          />
        </Field>

        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12px] text-muted">
          По каким дням принимать — задаётся в разделе «План недели», рядом с блюдами
          и тренировкой.
        </p>
      </div>
    </Sheet>
  );
}
