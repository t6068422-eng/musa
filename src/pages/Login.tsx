import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Successfully logged in');
      navigate(from, { replace: true });
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error('Failed to login: ' + (error.message || 'Unknown error'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-6">
      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="text-center space-y-2 pb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground text-3xl font-bold mx-auto mb-4 shadow-lg shadow-primary/20">
            M
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">MUSA TRADERS</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Inventory & Distribution Management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            className="w-full h-12 text-lg gap-3 shadow-lg shadow-primary/10" 
            onClick={handleGoogleLogin}
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </Button>
          <div className="pt-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
              Secure Admin Access
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
