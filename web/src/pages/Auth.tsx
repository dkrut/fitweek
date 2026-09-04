import { useState } from 'react';
import { Button, Card, Field, Input } from '../components/ui';
import { useLogin, useSetup } from '../lib/queries';
import { ApiError } from '../lib/api';

export default function AuthPage({ needsSetup }: { needsSetup: boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = useLogin();
  const setup = useSetup();
  const pending = login.isPending || setup.isPending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (needsSetup && password !== repeat) {
      setError('Пароли не совпадают');
      return;
    }

    try {
      if (needsSetup) {
        await setup.mutateAsync({ username, password });
      } else {
        await login.mutateAsync({ username, password });
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 429) {
        setError('Слишком много попыток. Подождите минуту.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Не удалось войти');
      }
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          {needsSetup ? 'Первый запуск' : 'Вход'}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {needsSetup
            ? 'Придумайте логин и пароль — это единственная учётная запись приложения.'
            : 'План тренировок и питания'}
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <Field label="Логин">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
              minLength={3}
            />
          </Field>

          <Field label="Пароль" hint={needsSetup ? 'Минимум 8 символов' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              required
              minLength={needsSetup ? 8 : 1}
            />
          </Field>

          {needsSetup ? (
            <Field label="Пароль ещё раз">
              <Input
                type="password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" loading={pending}>
            {needsSetup ? 'Создать и войти' : 'Войти'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
