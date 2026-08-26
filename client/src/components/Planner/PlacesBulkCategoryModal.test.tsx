import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../tests/helpers/render';

import { buildCategory } from '../../../tests/helpers/factories';
import { PlacesBulkCategoryModal } from './PlacesBulkCategoryModal';

describe('PlacesBulkCategoryModal', () => {
  it('replaces the complete additional category set on save', async () => {
    const user = userEvent.setup();
    const cafe = buildCategory({ name: 'Cafe' });
    const nature = buildCategory({ name: 'Nature' });
    const onPickAdditional = vi.fn();
    render(
      <PlacesBulkCategoryModal
        count={2}
        categories={[cafe, nature]}
        onPickPrimary={vi.fn()}
        onPickAdditional={onPickAdditional}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Additional categories/i }));
    await user.click(screen.getByRole('button', { name: 'Cafe' }));
    await user.click(screen.getByRole('button', { name: 'Nature' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onPickAdditional).toHaveBeenCalledWith([cafe.id, nature.id]);
  });

  it('keeps primary category updates separate', async () => {
    const user = userEvent.setup();
    const hotel = buildCategory({ name: 'Hotel' });
    const onPickPrimary = vi.fn();
    render(
      <PlacesBulkCategoryModal
        count={1}
        categories={[hotel]}
        onPickPrimary={onPickPrimary}
        onPickAdditional={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Hotel' }));
    expect(onPickPrimary).toHaveBeenCalledWith(hotel.id);
  });
});
