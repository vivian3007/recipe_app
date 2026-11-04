import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthScreen, authStyles } from '@/components/AuthScreen';
import { Button, Field } from '@/components/ui';
import { loginErrorText } from '@/lib/family';
import { auth } from '@/lib/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(loginErrorText(e));
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Weekmenu" subtitle="Samen kiezen wat de pot schaft">
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="jij@voorbeeld.nl"
      />
      <Field
        label="Wachtwoord"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="••••••••"
        onSubmitEditing={signIn}
      />
      {error && <Text style={authStyles.error}>{error}</Text>}
      <Button title="Inloggen" onPress={signIn} loading={busy} disabled={!email || !password} />
      <Text style={authStyles.switch}>
        Nog geen account?{' '}
        <Link href="/register" style={authStyles.link}>
          Maak er een
        </Link>
      </Text>
    </AuthScreen>
  );
}
