import * as qr from 'qrcode';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

export type QrCodeProps = {
  address?: string;
  link?: string;
  onClick?: () => void;
};

export const QrCode = (props: QrCodeProps) => {
  const { address, link, onClick } = props;
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const uri = link ?? `${address}`;
    qr.toDataURL(uri, { margin: 2, width: 200, color: { dark: '#000000', light: '#ffffff' } }, (err, url) => {
      if (err) {
        console.error(err);
        return;
      }
      setQrUrl(url);
    });
  }, [address, link]);

  const handleClick = () => {
    onClick?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!qrUrl) return null;

  return (
    <motion.div
      className="relative flex items-center justify-center cursor-pointer select-none"
      style={{ width: '10rem', height: '10rem' }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleClick}
    >
      <div
        className="rounded-2xl overflow-hidden border p-1.5"
        style={{
          borderColor: 'rgba(255,255,255,0.12)',
          backgroundColor: '#ffffff',
        }}
      >
        <img src={qrUrl} alt="Bitcoin QR Code" className="block rounded-xl" style={{ width: '9rem', height: '9rem' }} />
      </div>

      <AnimatePresence>
        {copied && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="w-8 h-8 text-green-400" strokeWidth={2.5} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
