import { useRef, useState } from 'react';
import { Download, LogOut, Upload } from 'lucide-react';
import type { Theme } from '@shared/index';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Segmented,
  Sheet,
  useToast,
} from '../components/ui';
import { downloadExport } from '../lib/api';
import { browserToday, formatDate } from '../lib/format';
import {
  useAuth,
  useChangePassword,
  useImportBackup,
  useLogout,
  useSettings,
} from '../lib/queries';
import { applyTheme, readStoredTheme } from '../lib/theme';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Настройки" subtitle="Часовой пояс, оформление и данные" />
      <div className="flex flex-col gap-4">
        <Clock />
        <Appearance />
        <DataSection />
        <Account />
      </div>
    </>
  );
}

/* --------------------------------- Time zone ------------------------------ */

/**
 * The server draws the day boundary: the journal follows its calendar. When the
 * container and the browser sit in different zones, today means different dates
 * for a few hours each day — better said plainly than left to guesswork.
 */
function Clock() {
  const auth = useAuth();
  if (!auth.data) return null;

  const serverDate = auth.data.serverDate;
  const local = browserToday();
  const mismatch = serverDate !== local;

  return (
    <Card>
      <CardTitle>Часовой пояс</CardTitle>
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-muted">Сервер</dt>
          <dd className="font-medium">
            {auth.data.timezone} · {formatDate(serverDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Этот браузер</dt>
          <dd className="font-medium">
            {Intl.DateTimeFormat().resolvedOptions().timeZone} · {formatDate(local)}
          </dd>
        </div>
      </dl>

      {mismatch ? (
        <p className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12px] text-warn">
          Даты расходятся. Приложение считает днём серверный календарь, так что
          ошибки в данных не будет — но чтобы «сегодня» совпадало с вашим, задайте
          в <code>.env</code> переменную <code>TZ</code> с поясом этого устройства
          и перезапустите контейнер.
        </p>
      ) : null}
    </Card>
  );
}

/* -------------------------------- Appearance ------------------------------ */

function Appearance() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const settings = useSettings();

  const change = (value: Theme) => {
    setTheme(value);
    applyTheme(value);
    // The theme is stored locally for instant effect and in the database for other devices.
    settings.update.mutate({ theme: value });
  };

  return (
    <Card>
      <CardTitle>Оформление</CardTitle>
      <Segmented
        value={theme}
        options={[
          { value: 'system', label: 'Как в системе' },
          { value: 'light', label: 'Светлая' },
          { value: 'dark', label: 'Тёмная' },
        ]}
        onChange={change}
      />
    </Card>
  );
}

/* ----------------------------------- Data --------------------------------- */

/**
 * One backup, all of it: the file holds the whole database and a restore
 * replaces it. Selective transfer is deliberately absent — merging two journals
 * covering the same dates would be done blind, and that is exactly where data
 * disappears silently.
 */
function DataSection() {
  const importBackup = useImportBackup();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    if (
      !window.confirm(
        'Восстановление заменит все текущие данные содержимым файла. Продолжить?',
      )
    ) {
      return;
    }
    try {
      const data: unknown = JSON.parse(await file.text());
      await importBackup.mutateAsync(data);
      toast('Данные восстановлены');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось восстановить', 'error');
    }
  };

  return (
    <Card>
      <CardTitle>Данные</CardTitle>
      <p className="text-[12px] text-muted">
        В файл попадает вся база: справочники, план недели, журнал и замеры.
        Восстановление заменяет текущее содержимое целиком.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void downloadExport()}>
          <Download size={16} />
          Выгрузить бэкап
        </Button>
        <Button onClick={() => fileInput.current?.click()} loading={importBackup.isPending}>
          <Upload size={16} />
          Восстановить из бэкапа
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void onFile(file);
          }}
        />
      </div>
    </Card>
  );
}

/* ---------------------------------- Account ------------------------------- */

function Account() {
  const logout = useLogout();
  const changePassword = useChangePassword();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');

  const submit = async () => {
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast('Пароль изменён, войдите заново');
      setOpen(false);
      logout.mutate();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось изменить пароль', 'error');
    }
  };

  return (
    <Card>
      <CardTitle>Аккаунт</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)}>Сменить пароль</Button>
        <Button variant="danger" onClick={() => logout.mutate()} loading={logout.isPending}>
          <LogOut size={16} />
          Выйти
        </Button>
      </div>

      {open ? (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title="Смена пароля"
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Отмена</Button>
              <Button
                variant="primary"
                loading={changePassword.isPending}
                onClick={() => void submit()}
              >
                Изменить
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted">
              Смена пароля завершит сессии на всех устройствах.
            </p>
            <Field label="Текущий пароль">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="Новый пароль" hint="Минимум 8 символов">
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNew(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>
        </Sheet>
      ) : null}
    </Card>
  );
}
