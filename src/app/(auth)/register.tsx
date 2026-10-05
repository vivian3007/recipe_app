import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthScreen, authStyles } from '@/components/AuthScreen';
import { Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp() {
    if (password.length < 6) {
      setError('Je wachtwoord moet minstens 6 tekens zijn.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else if (!data.session) {
      setInfo('Check je mail en klik op de bevestigingslink. Daarna kun je inloggen.');
    }
  }

  return (
    <AuthScreen title="Account maken" subtitle="Iedereen in het gezin maakt een eigen account">
      <Field label="Je naam" value={name} onChangeText={setName} placeholder="Bijv. Vivian" autoComplete="name" />
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
        autoComplete="new-password"
        placeholder="Minstens 6 tekens"
      />
      {error && <Text style={authStyles.error}>{error}</Text>}
      {info && <Text style={authStyles.info}>{info}</Text>}
      <Button title="Account maken" onPress={signUp} loading={busy} disabled={!name.trim() || !email || !password} />
      <Text style={authStyles.switch}>
        Heb je al een account?{' '}
        <Link href="/login" style={authStyles.link}>
          Inloggen
        </Link>
      </Text>
    </AuthScreen>
  );
}
