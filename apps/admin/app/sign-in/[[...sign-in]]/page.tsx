import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Blink Admin</h2>
          <p className="text-gray-600">Sign in to access the admin panel</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <SignIn 
            appearance={{
              elements: {
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-sm normal-case',
                card: 'shadow-none',
              },
            }}
            redirectUrl="/"
            signUpUrl={undefined} // Disable signup
            routing="path"
            path="/sign-in"
          />
        </div>
      </div>
    </div>
  );
}
