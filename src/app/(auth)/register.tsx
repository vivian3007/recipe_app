import { Link } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthScreen, authStyles } from '@/components/AuthScreen';
import { Button, Field } from '@/components/ui';
import { updateDisplayName } from '@/lib/api';
import { ensureProfile, loginErrorText } from '@/lib/family';
import { auth } from '@/lib/firebase';
import { readPendingInvite } from '@/lib/invite';
import { useSession } from '@/lib/session';

export default function Register() {
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp() {
    if (password.length < 6) {
      setError('Je wachtwoord moet minstens 6 tekens zijn.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // The session may have made the profile already, without the name.
      await ensureProfile(user.uid, name, user.email);
      await updateDisplayName(user.uid, name.trim());
      await refresh();
    } catch (e) {
      setError(loginErrorText(e));
    }
    setBusy(false);
  }

  return (
    <AuthScreen
      title={readPendingInvite() ? 'Je bent uitgenodigd!' : 'Account maken'}
      subtitle={
        readPendingInvite()
          ? 'Maak een account, dan zit je er meteen bij. Heb je er al een? Log dan in.'
          : 'Iedereen in het gezin maakt een eigen account'
      }
    >
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
