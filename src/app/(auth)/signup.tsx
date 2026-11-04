import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { HumanCheckField } from '@/components/auth/human-check';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import {
  isUsernameAvailable,
  normalizeUsername,
  signUp,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/features/auth/api';
import {
  generateHumanChallenge,
  validateDisplayName,
  verifyBotSignals,
  type HumanChallenge,
} from '@/lib/security';
import { useTheme } from '@/theme';

type UsernameStatus = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function SignupScreen() {
  const { colors } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Anti-bot signals: honeypot, interaction timer y challenge aritmético
  const mountedAtRef = useRef<number>(0);
  const [honeypot, setHoneypot] = useState('');
  const [challenge, setChallenge] = useState<HumanChallenge>(() => generateHumanChallenge());
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeError, setChallengeError] = useState<string | null>(null);

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Verificación automática en tiempo real de unicidad del @username
  useEffect(() => {
    const clean = normalizeUsername(username);
    if (!clean) {
      return;
    }
    const problem = validateUsername(clean);
    if (problem) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setUsernameStatus('checking');
      try {
        const available = await isUsernameAvailable(clean);
        if (!cancelled) {
          setUsernameStatus(available ? 'ok' : 'taken');
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus('idle');
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  async function checkUsername() {
    const value = normalizeUsername(username);
    const problem = validateUsername(value);
    if (problem) {
      setUsernameStatus(value ? 'invalid' : 'idle');
      return;
    }
    setUsernameStatus('checking');
    try {
      const available = await isUsernameAvailable(value);
      setUsernameStatus(available ? 'ok' : 'taken');
    } catch {
      setUsernameStatus('idle');
    }
  }

  const usernameError =
    usernameStatus === 'taken'
      ? 'Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.'
      : usernameStatus === 'invalid'
        ? validateUsername(username)
        : null;

  async function onSubmit() {
    setError(null);
    setChallengeError(null);

    // 1. Detección de bots por trampas invisibles y velocidad no humana
    const botDetected = verifyBotSignals({
      honeypot,
      mountedAt: mountedAtRef.current,
      minInteractionMs: 1500,
    });
    if (botDetected) {
      return setError(botDetected);
    }

    // 2. Validación de respuesta al reto aritmético
    if (challengeAnswer.trim() !== challenge.expectedAnswer) {
      setChallengeError('Respuesta incorrecta. Resuelve el cálculo para continuar.');
      return;
    }

    // 3. Validación de campos de entrada
    const nameProblem = validateDisplayName(displayName);
    if (nameProblem) return setError(nameProblem);

    const usernameProblem = validateUsername(username);
    if (usernameProblem) return setError(usernameProblem);

    const emailProblem = validateEmail(email);
    if (emailProblem) return setError(emailProblem);

    const passwordProblem = validatePassword(password, true);
    if (passwordProblem) return setError(passwordProblem);

    if (usernameStatus === 'taken') {
      return setError(
        'Ese nombre de usuario ya está en uso. Elige un nombre de usuario único.',
      );
    }

    setBusy(true);
    try {
      await signUp({
        email,
        password,
        username: normalizeUsername(username),
        displayName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear la cuenta.');
      setChallenge(generateHumanChallenge());
      setChallengeAnswer('');
    } finally {
      setBusy(false);
    }
  }

  const isChallengeSolved = challengeAnswer.trim() === challenge.expectedAnswer;

  return (
    <AuthShell title="Crea tu cuenta" subtitle="Tres datos y ya estás dentro.">
      <ErrorBanner message={error} />

      <TextField
        label="Nombre"
        icon="happy-outline"
        placeholder="Cómo te llaman"
        autoCapitalize="words"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
      />

      <View style={{ gap: 6 }}>
        <TextField
          label="Nombre de usuario (único)"
          icon="at-outline"
          placeholder="ana_22"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={(value) => {
            setUsername(value.toLowerCase().replace(/\s+/g, ''));
            const clean = normalizeUsername(value);
            if (!clean) {
              setUsernameStatus('idle');
            } else if (validateUsername(clean)) {
              setUsernameStatus('invalid');
            } else {
              setUsernameStatus('checking');
            }
          }}
          onBlur={checkUsername}
          maxLength={20}
          error={usernameError}
          right={
            usernameStatus === 'checking' ? (
              <Icon name="ellipsis-horizontal" size={18} color={colors.textFaint} />
            ) : usernameStatus === 'ok' ? (
              <Icon name="checkmark-circle" size={20} color="#2BD67B" />
            ) : usernameStatus === 'taken' ? (
              <Icon name="close-circle" size={20} color={colors.danger} />
            ) : null
          }
        />
        <AppText variant="micro" color={usernameStatus === 'ok' ? '#2BD67B' : colors.textFaint}>
          {usernameStatus === 'ok'
            ? 'Disponible. Este nombre de usuario es único para ti.'
            : 'Único en Redup · solo minúsculas, números, punto y guion bajo.'}
        </AppText>
      </View>

      <TextField
        label="Correo"
        icon="mail-outline"
        placeholder="tu@correo.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextField
        label="Contraseña"
        icon="lock-closed-outline"
        placeholder="Mínimo 8 caracteres, letras y números"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {/* Reto y trampa anti-bots */}
      <HumanCheckField
        challenge={challenge}
        answer={challengeAnswer}
        onChangeAnswer={setChallengeAnswer}
        onRefresh={() => {
          setChallenge(generateHumanChallenge());
          setChallengeAnswer('');
          setChallengeError(null);
        }}
        honeypot={honeypot}
        onChangeHoneypot={setHoneypot}
        error={challengeError}
      />

      <Button
        title="Crear cuenta"
        size="lg"
        onPress={onSubmit}
        loading={busy}
        disabled={
          busy ||
          usernameStatus === 'taken' ||
          usernameStatus === 'checking' ||
          !isChallengeSolved
        }
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 }}>
        <AppText color={colors.textMuted}>¿Ya tienes cuenta?</AppText>
        <Pressable onPress={() => router.replace('/login')}>
          <AppText variant="bodyStrong" color={colors.primary}>
            Entrar
          </AppText>
        </Pressable>
      </View>
    </AuthShell>
  );
}
