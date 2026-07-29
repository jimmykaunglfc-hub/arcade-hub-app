'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Adjust path if necessary
import { X } from 'lucide-react';

export default function InjectItemModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    item_type: 'cosmetic',
    price_amount: '',
    price_currency: 'gems',
    image_url: ''
  });

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    setFormData({
      ...formData,
      item_type: type,
      // Auto-switch currency based on logic
      price_currency: type === 'gem_pack' ? 'fiat_usd' : 'gems'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase
      .from('store_items')
      .insert([{
        title: formData.title,
        description: formData.description,
        item_type: formData.item_type,
        price_amount: parseFloat(formData.price_amount),
        price_currency: formData.price_currency,
        image_url: formData.image_url
      }]);

    setIsSubmitting(false);

    if (error) {
      alert('Error creating item: ' + error.message);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#121212] border border-gray-800 rounded-2xl w-full max-w-lg p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <X className="w-6 h-6" />
        </button>
        
        <h2 className="text-2xl font-bold text-white mb-6">Inject New Item</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Item Title</label>
            <input 
              required
              type="text" 
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-[#c4ff00]"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Item Type</label>
            <select 
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-[#c4ff00]"
              value={formData.item_type}
              onChange={handleTypeChange}
            >
              <option value="cosmetic">Cosmetic Item</option>
              <option value="gem_pack">Gem Pack</option>
            </select>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Price</label>
              <input 
                required
                type="number"
                step="0.01"
                min="0"
                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-[#c4ff00]"
                value={formData.price_amount}
                onChange={(e) => setFormData({...formData, price_amount: e.target.value})}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Currency</label>
              <select 
                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-[#c4ff00] disabled:opacity-50"
                value={formData.price_currency}
                disabled={formData.item_type === 'gem_pack'}
                onChange={(e) => setFormData({...formData, price_currency: e.target.value})}
              >
                {formData.item_type === 'gem_pack' ? (
                  <option value="fiat_usd">Fiat (USD)</option>
                ) : (
                  <>
                    <option value="gems">Gems</option>
                    <option value="points">Points</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Image URL (Optional)</label>
            <input 
              type="url" 
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-[#c4ff00]"
              value={formData.image_url}
              onChange={(e) => setFormData({...formData, image_url: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full mt-4 p-3 bg-[#c4ff00] text-black font-bold rounded-lg hover:bg-[#b3e600] transition disabled:opacity-50"
          >
            {isSubmitting ? 'Injecting...' : 'Inject Item'}
          </button>
        </form>
      </div>
    </div>
  );
}